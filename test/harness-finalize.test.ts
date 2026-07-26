import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { createHandoffFile, getHandoffPaths } from "../src/handoff/file.js";
import { finalizeSession } from "../src/harness/finalize.js";
import { readLatestSessionLog } from "../src/util/session-log.js";
import { classifyTask } from "../src/routing/classify.js";
import type { HarnessAttemptLog } from "../src/config/types.js";
import { makeTempDir } from "./support/tmp.js";

// finalizeSession is what runs after a handoff or a clean exit: it writes the
// closing checkpoint, archives the handoff, and persists the session log. If it
// throws or writes nothing, the record of what happened is simply lost.
const attempt = (overrides: Partial<HarnessAttemptLog> = {}): HarnessAttemptLog => ({
  provider: "claude",
  label: "Claude Code",
  command: "claude",
  args: [],
  startedAt: "2026-07-26T10:00:00.000Z",
  endedAt: "2026-07-26T10:05:00.000Z",
  exitCode: 0,
  transcriptExcerpt: "work in progress",
  ...overrides
});

const setup = async () => {
  const cwd = await makeTempDir();
  const config = defaultConfig();
  const providers = config.harness.providers.slice(0, 2);
  await createHandoffFile(cwd, config, providers, "2026-07-26T10:00:00.000Z", "Fix the checkout flow");

  return {
    cwd,
    config,
    providers,
    base: {
      cwd,
      config,
      providers,
      startedAt: "2026-07-26T10:00:00.000Z",
      sessionId: "session-1",
      handoffPath: getHandoffPaths(cwd, config).livePath,
      sessionPrompt: "session prompt",
      handoffPrompt: undefined,
      attempts: [attempt()],
      finalProvider: "claude",
      success: true,
      aborted: false,
      meaningfulTranscriptExcerpt: (excerpt: string | undefined) => excerpt
    }
  };
};

describe("finalizeSession", () => {
  it("writes a session log, archives the handoff, and records handoff quality", async () => {
    const { cwd, config, base } = await setup();

    const log = await finalizeSession(base);

    expect(log).toMatchObject({ finalProvider: "claude", success: true });
    expect(log.providerOrder).toEqual(base.providers.map((provider) => provider.name));
    // The goal was set when the handoff was created, so quality reflects that.
    expect(log.handoffQuality).toMatchObject({ taskInitialized: true, narrativeUpdated: false });

    const persisted = await readLatestSessionLog(cwd, config);
    expect(persisted).toMatchObject({ finalProvider: "claude", success: true });
    expect(persisted?.attempts).toHaveLength(1);

    const archive = await readFile(
      path.join(getHandoffPaths(cwd, config).archiveDir, "session-1.md"),
      "utf8"
    );
    expect(archive).toContain("keepitmovin Handoff");
  });

  it("appends a session-end checkpoint to the live handoff", async () => {
    const { cwd, config, base } = await setup();

    await finalizeSession(base);

    const handoff = await readFile(getHandoffPaths(cwd, config).livePath, "utf8");
    expect(handoff).toContain("Session ended");
    expect(handoff).toContain("The final provider process exited cleanly.");
  });

  it("records an aborted session as stopped by the user, not as a clean exit", async () => {
    const { cwd, config, base } = await setup();

    const log = await finalizeSession({ ...base, aborted: true, success: false });

    expect(log.aborted).toBe(true);
    expect(log.success).toBe(false);
    const handoff = await readFile(getHandoffPaths(cwd, config).livePath, "utf8");
    expect(handoff).toContain("You stopped the session with Ctrl-C.");
  });

  it("keeps the route in the log when the session was routed, and omits it otherwise", async () => {
    const { base } = await setup();
    const routeDecision = classifyTask({ task: "Implement the approved plan" });

    const routed = await finalizeSession({ ...base, task: "Implement the approved plan", routeDecision });
    expect(routed.routeDecision).toMatchObject({ tier: routeDecision.tier });
    expect(routed.task).toBe("Implement the approved plan");

    const unrouted = await finalizeSession({ ...(await setup()).base });
    expect(unrouted.routeDecision).toBeUndefined();
  });

  it("still writes a log when there is no live handoff file to archive", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();

    const log = await finalizeSession({
      cwd,
      config,
      providers: config.harness.providers.slice(0, 1),
      startedAt: "2026-07-26T10:00:00.000Z",
      sessionId: "session-empty",
      handoffPath: getHandoffPaths(cwd, config).livePath,
      sessionPrompt: "session prompt",
      handoffPrompt: undefined,
      attempts: [attempt({ errorType: "rate_limit", exitCode: 1 })],
      finalProvider: undefined,
      success: false,
      aborted: false,
      meaningfulTranscriptExcerpt: (excerpt) => excerpt
    });

    expect(log.success).toBe(false);
    expect(log.handoffQuality).toBeUndefined();
    await expect(readLatestSessionLog(cwd, config)).resolves.toMatchObject({ success: false });
  });
});
