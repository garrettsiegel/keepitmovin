import stripAnsi from "strip-ansi";
import type { UsageSnapshot } from "../probes/usage.js";
import type { WatchdogEventLog } from "../config/types.js";

const LOOP_WINDOW_MS = 5 * 60_000;
const WARNING_COOLDOWN_MS = 10 * 60_000;
const STALL_AFTER_MS = 10 * 60_000;
const RECENT_OUTPUT_MS = 30_000;

const normalizeBlock = (value: string): string => stripAnsi(value)
  .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, "<time>")
  .replace(/\s+/g, " ")
  .trim();

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
};

export interface WatchdogTracker {
  observeOutput(data: string): WatchdogEventLog[];
  observeProgress(): void;
  observeUsage(snapshot: UsageSnapshot): WatchdogEventLog[];
}

export const createWatchdogTracker = (options: {
  provider: string;
  now?: () => number;
}): WatchdogTracker => {
  const now = options.now ?? Date.now;
  const repetitions = new Map<string, number[]>();
  const lastWarning = new Map<WatchdogEventLog["type"], number>();
  const usage: Array<{ at: number; percent: number; source: string }> = [];
  let paragraphBuffer = "";
  let lastProgressAt = now();
  let lastOutputAt = 0;
  let outputSinceProgress = false;

  const event = (type: WatchdogEventLog["type"], detail: string): WatchdogEventLog | undefined => {
    const at = now();
    const previous = lastWarning.get(type) ?? 0;
    if (previous && at - previous < WARNING_COOLDOWN_MS) return undefined;
    lastWarning.set(type, at);
    return { type, provider: options.provider, detectedAt: new Date(at).toISOString(), detail };
  };

  const detectLoop = (data: string): WatchdogEventLog | undefined => {
    paragraphBuffer = `${paragraphBuffer}${stripAnsi(data)}`.slice(-20_000);
    const blocks = paragraphBuffer.split(/\n\s*\n/);
    paragraphBuffer = blocks.pop() ?? "";
    for (const raw of blocks) {
      const block = normalizeBlock(raw);
      if (block.length < 200 || !/[A-Za-z]{6}/.test(block)) continue;
      const cutoff = now() - LOOP_WINDOW_MS;
      const seen = (repetitions.get(block) ?? []).filter((at) => at >= cutoff);
      seen.push(now());
      repetitions.set(block, seen);
      if (seen.length >= 3) {
        return event("loop", "The same substantial output block appeared three times within five minutes.");
      }
    }
    return undefined;
  };

  const detectStall = (): WatchdogEventLog | undefined => {
    const at = now();
    if (!outputSinceProgress || at - lastProgressAt < STALL_AFTER_MS) return undefined;
    if (!lastOutputAt || at - lastOutputAt > RECENT_OUTPUT_MS) return undefined;
    return event("stall", "Output is still arriving, but no project or handoff progress signal changed for ten minutes.");
  };

  return {
    observeOutput(data) {
      lastOutputAt = now();
      outputSinceProgress = true;
      return [detectLoop(data), detectStall()].filter((value): value is WatchdogEventLog => Boolean(value));
    },
    observeProgress() {
      lastProgressAt = now();
      outputSinceProgress = false;
    },
    observeUsage(snapshot) {
      const at = now();
      const previous = usage.at(-1);
      if (previous && (snapshot.sourceFile !== previous.source || snapshot.usedPercent < previous.percent)) {
        usage.length = 0;
      }
      usage.push({ at, percent: snapshot.usedPercent, source: snapshot.sourceFile });
      if (usage.length > 8) usage.shift();
      if (usage.length < 4) return [];
      const rates = usage.slice(1).map((sample, index) => {
        const before = usage[index]!;
        const minutes = Math.max((sample.at - before.at) / 60_000, 0.01);
        return ((sample.percent - before.percent) / minutes) * 10;
      });
      const current = rates.at(-1) ?? 0;
      const baseline = median(rates.slice(0, -1));
      if (current < 5 || baseline < 0.1 || current < baseline * 5) return [];
      const warning = event("burn", `Usage rose ${current.toFixed(1)} percentage points per ten minutes, over five times this session's baseline.`);
      return warning ? [warning] : [];
    }
  };
};
