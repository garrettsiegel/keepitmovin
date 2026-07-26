import { describe, expect, it } from "vitest";
import { createWatchdogTracker } from "../src/harness/watchdog.js";

const usage = (usedPercent: number) => ({
  usedPercent,
  limitingWindow: "secondary" as const,
  sourceFile: "/tmp/rollout.jsonl"
});

describe("warning-only watchdog", () => {
  it("warns after a substantial output block repeats three times", () => {
    let now = 1_000;
    const tracker = createWatchdogTracker({ provider: "codex", now: () => now });
    const block = "The same failing command is running again because the dependency cannot be resolved. ".repeat(4);
    expect(tracker.observeOutput(`${block}\n\n`)).toEqual([]);
    now += 1_000;
    expect(tracker.observeOutput(`${block}\n\n`)).toEqual([]);
    now += 1_000;
    expect(tracker.observeOutput(`${block}\n\n`)).toEqual([
      expect.objectContaining({ type: "loop", provider: "codex" })
    ]);
  });

  it("warns on a sustained burn spike after establishing a baseline", () => {
    let now = 0;
    const tracker = createWatchdogTracker({ provider: "codex", now: () => now });
    expect(tracker.observeUsage(usage(0))).toEqual([]);
    now += 600_000;
    expect(tracker.observeUsage(usage(1))).toEqual([]);
    now += 600_000;
    expect(tracker.observeUsage(usage(2))).toEqual([]);
    now += 600_000;
    expect(tracker.observeUsage(usage(8))).toEqual([
      expect.objectContaining({ type: "burn", provider: "codex" })
    ]);
  });

  it("warns when output continues for ten minutes without a progress signal", () => {
    let now = 1;
    const tracker = createWatchdogTracker({ provider: "claude", now: () => now });
    expect(tracker.observeOutput("working\n")).toEqual([]);
    now += 600_000;
    expect(tracker.observeOutput("still working\n")).toEqual([
      expect.objectContaining({ type: "stall", provider: "claude" })
    ]);
  });

  it("resets stall timing after a project progress signal", () => {
    let now = 1;
    const tracker = createWatchdogTracker({ provider: "claude", now: () => now });
    tracker.observeOutput("working\n");
    now += 540_000;
    tracker.observeProgress();
    now += 120_000;
    expect(tracker.observeOutput("working again\n")).toEqual([]);
  });
});
