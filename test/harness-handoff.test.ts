import { readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { runHarness, type PtyFactory } from "../src/harness/index.js";
import { makeTempDir } from "./support/tmp.js";
import { FakePty } from "./support/fake-pty.js";

describe("runHarness — handoff refresh", () => {
  it("refreshes the handoff's mechanical sections while a tool runs", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.idleTimeoutMs = 1_400;
    config.harness.handoffRefresh.intervalMs = 1_000;
    config.harness.providerOrder = ["solo"];
    config.harness.providers = [
      {
        name: "solo", label: "Solo", enabled: true, command: "fake-solo",
        args: ["{{sessionPrompt}}"], handoffArgs: ["{{handoffPrompt}}"], integrationType: "pty"
      }
    ];
    const ptyFactory: PtyFactory = () => new FakePty({ data: "working", exitCode: 1, waitForKill: true });

    await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async () => undefined,
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    const content = await readFile(path.join(cwd, ".keepitmovin", "current", "handoff.md"), "utf8");
    expect(content).toContain("## Repository Snapshot");
    expect(content).not.toContain("Recent diff:");
    // The watcher rewrote the snapshot to a time after the session-start line —
    // proof it fired.
    const startedLine = content.split("\n").find((line) => line.includes("Session started")) ?? "";
    const startedTs = startedLine.replace(/^- /, "").split("—")[0]?.trim();
    const refreshedTs = content.match(/Last refreshed: (\S+)/)?.[1];
    expect(refreshedTs).toBeDefined();
    expect(refreshedTs).not.toBe(startedTs);
  });

  it("nudges into the tool's PTY when the handoff goes stale mid-session", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.idleTimeoutMs = 1_300;
    config.harness.handoffRefresh.intervalMs = 1_000;
    config.harness.providerOrder = ["solo"];
    config.harness.providers = [
      {
        name: "solo", label: "Solo", enabled: true, command: "fake-solo",
        args: ["{{sessionPrompt}}"], handoffArgs: ["{{handoffPrompt}}"], integrationType: "pty"
      }
    ];
    let pty: FakePty | undefined;
    const ptyFactory: PtyFactory = () => {
      pty = new FakePty({ data: "working normally on the task", exitCode: 1, waitForKill: true });
      return pty;
    };

    await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async () => undefined,
      nudgeTiming: { staleAfterMs: 100, idleForMs: 50, minTranscriptGrowthChars: 5 },
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(pty?.writes.some((write) => write.includes("Please update the keepitmovin handoff file"))).toBe(true);
  });

  it("does not nudge while the handoff narrative is still fresh", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.idleTimeoutMs = 1_300;
    config.harness.handoffRefresh.intervalMs = 1_000;
    config.harness.providerOrder = ["solo"];
    config.harness.providers = [
      {
        name: "solo", label: "Solo", enabled: true, command: "fake-solo",
        args: ["{{sessionPrompt}}"], handoffArgs: ["{{handoffPrompt}}"], integrationType: "pty"
      }
    ];
    let pty: FakePty | undefined;
    const ptyFactory: PtyFactory = () => {
      pty = new FakePty({ data: "working normally on the task", exitCode: 1, waitForKill: true });
      return pty;
    };

    await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async () => undefined,
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(pty?.writes.some((write) => write.includes("Please update the keepitmovin handoff file"))).toBe(false);
  });
});
