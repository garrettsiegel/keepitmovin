import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { readLatestSessionLog, resolveSessionsDir, writeSessionLog } from "../src/session-log.js";
import type { HarnessSessionLog } from "../src/types.js";
import { makeTempDir } from "./support/tmp.js";


const sampleLog = (): HarnessSessionLog => ({
  cwd: "/tmp/project",
  startedAt: "2026-07-04T10:00:00.000Z",
  endedAt: "2026-07-04T10:05:00.000Z",
  providerOrder: ["claude", "codex"],
  attempts: [
    {
      provider: "claude",
      label: "Claude Code",
      command: "claude",
      args: ["Implement with ANTHROPIC_API_KEY=sk-ant-api03-AbCdEf0123456789ghIJKlMnOp"],
      startedAt: "2026-07-04T10:00:00.000Z",
      endedAt: "2026-07-04T10:03:00.000Z",
      exitCode: 1,
      errorType: "rate_limit",
      transcriptExcerpt: "exported ANTHROPIC_API_KEY=sk-ant-api03-AbCdEf0123456789ghIJKlMnOp done",
      handoffReceipt: {
        status: "received",
        restatedGoal: "Use sk-ant-api03-AbCdEf0123456789ghIJKlMnOp",
        nextAction: "run tests"
      },
      route: {
        tier: "standard",
        reason: "settled plan or known reproduction",
        signals: ["settled plan or known reproduction"],
        source: "classifier",
        provider: "claude",
        model: "sonnet",
        effort: "medium"
      }
    }
  ],
  finalProvider: "codex",
  success: true,
  changedFiles: ["src/app.ts"],
  task: "Implement with ANTHROPIC_API_KEY=sk-ant-api03-AbCdEf0123456789ghIJKlMnOp",
  routeDecision: {
    tier: "standard",
    reason: "settled plan or known reproduction",
    signals: ["settled plan or known reproduction"],
    source: "classifier"
  },
  outcome: "completed",
  handoffQuality: {
    taskInitialized: true,
    narrativeUpdated: true,
    missingSections: [],
    placeholdersRemaining: []
  }
});

describe("session log", () => {
  it("writes and reads back a valid session log", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const logPath = await writeSessionLog(cwd, config, sampleLog());
    expect(logPath.startsWith(resolveSessionsDir(cwd, config))).toBe(true);

    const latest = await readLatestSessionLog(cwd, config);
    expect(latest?.finalProvider).toBe("codex");
    expect(latest?.attempts[0]?.provider).toBe("claude");
    expect(latest?.attempts[0]?.route?.model).toBe("sonnet");
    expect(latest?.outcome).toBe("completed");
  });

  it("redacts secrets in transcript excerpts before persisting", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const logPath = await writeSessionLog(cwd, config, sampleLog());

    const rawFile = await readFile(logPath, "utf8");
    expect(rawFile).not.toContain("sk-ant-api03-AbCdEf0123456789ghIJKlMnOp");
    expect(rawFile).toContain("[REDACTED:anthropic-key]");
  });

  it("returns undefined for a corrupt or mistyped session log", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const sessionsDir = resolveSessionsDir(cwd, config);
    await mkdir(sessionsDir, { recursive: true });
    // Valid JSON but wrong shape (attempts should be an array).
    await writeFile(
      path.join(sessionsDir, "2026-07-04T10-00-00-000Z.json"),
      JSON.stringify({ cwd: "/tmp", attempts: "nope" }),
      "utf8"
    );

    expect(await readLatestSessionLog(cwd, config)).toBeUndefined();
  });
});
