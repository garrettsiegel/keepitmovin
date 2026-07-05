import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  appendSwitchHistoryLine,
  buildNudgeMessage,
  refreshHandoffFile,
  replaceSection,
  startHandoffWatcher,
  type HandoffWatcherContext
} from "../src/handoff-refresh.js";

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-refresh-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

// A minimal handoff file with all managed sections present.
const template = (): string =>
  [
    "# CodePass Handoff",
    "",
    "## Current Goal",
    "",
    "- Ship the feature.",
    "",
    "## Changed Files",
    "",
    "- stale.ts",
    "",
    "## Repository Snapshot",
    "",
    "Last refreshed: 2020-01-01T00:00:00.000Z",
    "",
    "```txt",
    "stale snapshot",
    "```",
    "",
    "## Switch History",
    "",
    "- 2020 — Session started",
    ""
  ].join("\n");

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("replaceSection", () => {
  const doc = ["## A", "", "aaa", "", "## B", "", "bbb", "", "## C", "", "ccc", ""].join("\n");

  it("replaces a section in the middle, leaving neighbors intact", () => {
    const result = replaceSection(doc, "B", "NEW");
    expect(result).toContain("## B\n\nNEW\n");
    expect(result).toContain("## A\n\naaa");
    expect(result).toContain("## C\n\nccc");
    expect(result).not.toContain("bbb");
  });

  it("replaces the final section up to EOF", () => {
    const result = replaceSection(doc, "C", "NEW");
    expect(result).toContain("## C\n\nNEW");
    expect(result).not.toContain("ccc");
  });

  it("appends the section when the heading is missing", () => {
    const result = replaceSection(doc, "Z", "zzz");
    expect(result).toContain("## Z\n\nzzz");
    expect(result).toContain("## A\n\naaa");
  });

  it("leaves multi-line agent prose in other sections untouched", () => {
    const agent = ["## Goal", "", "Line 1", "- item a", "- item b", "", "## Other", "", "x", ""].join("\n");
    const result = replaceSection(agent, "Other", "y");
    expect(result).toContain("## Goal\n\nLine 1\n- item a\n- item b");
    expect(result).toContain("## Other\n\ny");
  });
});

describe("appendSwitchHistoryLine", () => {
  it("keeps only the newest `keep` entries", () => {
    let content = replaceSection("# H\n", "Switch History", "");
    for (let index = 1; index <= 12; index += 1) {
      content = appendSwitchHistoryLine(content, `- entry ${index}`, 10);
    }
    const body = content.slice(content.indexOf("## Switch History"));
    const entries = body.split("\n").filter((line) => line.startsWith("- entry "));
    expect(entries).toHaveLength(10);
    expect(entries[0]).toBe("- entry 3");
    expect(entries.at(-1)).toBe("- entry 12");
  });
});

describe("refreshHandoffFile", () => {
  it("rewrites Changed Files and Repository Snapshot in place (non-git)", async () => {
    const cwd = await makeTempDir();
    const handoffPath = path.join(cwd, "handoff.md");
    await writeFile(handoffPath, template(), "utf8");

    const ok = await refreshHandoffFile(cwd, defaultConfig(), handoffPath);
    const content = await readFile(handoffPath, "utf8");

    expect(ok).toBe(true);
    expect(content).toContain("Last refreshed:");
    expect(content).not.toContain("Last refreshed: 2020-01-01");
    expect(content).toContain("## Changed Files\n\n- None.");
    expect(content).toContain("No git repository detected.");
    expect(content).not.toContain("stale.ts");
    // Agent-owned section untouched.
    expect(content).toContain("## Current Goal\n\n- Ship the feature.");
  });

  it("returns false and does not throw when the file is missing", async () => {
    const cwd = await makeTempDir();
    await expect(
      refreshHandoffFile(cwd, defaultConfig(), path.join(cwd, "nope.md"))
    ).resolves.toBe(false);
  });
});

describe("buildNudgeMessage", () => {
  it("names the path and ends with a newline", () => {
    const message = buildNudgeMessage("/repo/.codepass/current/handoff.md");
    expect(message).toContain("/repo/.codepass/current/handoff.md");
    expect(message.endsWith("\n")).toBe(true);
  });
});

const watcherContext = async (overrides: Partial<HandoffWatcherContext> = {}): Promise<{
  ctx: HandoffWatcherContext;
  handoffPath: string;
  writes: string[];
}> => {
  const cwd = await makeTempDir();
  const handoffPath = path.join(cwd, "handoff.md");
  await writeFile(handoffPath, template(), "utf8");
  const config = defaultConfig();
  config.harness.handoffRefresh.intervalMs = 30; // runtime override for a fast test
  const writes: string[] = [];
  const ctx: HandoffWatcherContext = {
    cwd,
    config,
    handoffPath,
    transcriptLength: () => 0,
    lastActivityAt: () => Date.now(),
    isSettled: () => false,
    writeToChild: (text) => writes.push(text),
    ...overrides
  };
  return { ctx, handoffPath, writes };
};

describe("startHandoffWatcher", () => {
  it("refreshes the mechanical sections on the interval and stops on stop()", async () => {
    const { ctx, handoffPath } = await watcherContext();
    const stop = startHandoffWatcher(ctx);
    await wait(90);

    expect(await readFile(handoffPath, "utf8")).toContain("Last refreshed:");
    stop();
    await wait(50); // let any in-flight tick settle before snapshotting
    const frozen = await readFile(handoffPath, "utf8");
    await wait(90);
    expect(await readFile(handoffPath, "utf8")).toBe(frozen);
  });

  it("nudges when the narrative is stale, work happened, and the tool is idle", async () => {
    let transcriptLength = 0;
    const { ctx, writes } = await watcherContext({
      transcriptLength: () => transcriptLength,
      lastActivityAt: () => Date.now() - 60_000 // idle for a minute
    });
    ctx.config.harness.handoffRefresh.nudge = {
      enabled: true,
      staleAfterMs: 50,
      idleForMs: 10,
      minTranscriptGrowthChars: 5
    };

    const stop = startHandoffWatcher(ctx);
    transcriptLength = 100; // tool produced output AFTER arming, never touched the narrative
    await wait(150);
    stop();

    expect(writes.some((write) => write.includes("Please update the CodePass handoff file"))).toBe(true);
  });

  it("does nothing when the watcher is disabled", async () => {
    const { ctx, handoffPath, writes } = await watcherContext();
    ctx.config.harness.handoffRefresh.enabled = false;
    const stop = startHandoffWatcher(ctx);
    await wait(90);
    stop();

    // Untouched: the template's original timestamp is still there.
    expect(await readFile(handoffPath, "utf8")).toContain("Last refreshed: 2020-01-01");
    expect(writes).toHaveLength(0);
  });

  it("refreshes but never nudges when the nudge is disabled", async () => {
    let transcriptLength = 0;
    const { ctx, handoffPath, writes } = await watcherContext({
      transcriptLength: () => transcriptLength,
      lastActivityAt: () => Date.now() - 60_000
    });
    ctx.config.harness.handoffRefresh.nudge = {
      enabled: false,
      staleAfterMs: 50,
      idleForMs: 10,
      minTranscriptGrowthChars: 5
    };
    transcriptLength = 100;

    const stop = startHandoffWatcher(ctx);
    await wait(120);
    stop();

    expect(await readFile(handoffPath, "utf8")).toContain("Last refreshed:");
    expect(writes).toHaveLength(0);
  });
});
