import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodePassConfig, InteractiveProviderConfig, UsageProbeSpec } from "./types.js";

// Snapshot of a tool's own reported usage, read from its local session files.
export interface UsageSnapshot {
  // max(primary, secondary) — the number compared against the threshold.
  usedPercent: number;
  // Which window is the binding constraint right now.
  limitingWindow: "primary" | "secondary";
  windowMinutes?: number;
  resetsInSeconds?: number;
  primaryUsedPercent?: number;
  secondaryUsedPercent?: number;
  sourceFile: string;
}

export interface UsageProbeOptions {
  baseDir?: string; // default: path.join(os.homedir(), ".codex")
  now?: () => Date; // default: () => new Date()
  maxDaysBack?: number; // default: 7
}
interface RawWindow {
  used_percent?: unknown;
  window_minutes?: unknown;
  resets_in_seconds?: unknown;
}

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

// Parses one JSONL line; returns a snapshot (sans sourceFile) or undefined.
// Tolerates: missing rate_limits (skip), flat rate_limits.used_percent with no
// primary/secondary objects (treated as primary), malformed JSON (skip).
const parseRateLimitLine = (line: string): Omit<UsageSnapshot, "sourceFile"> | undefined => {
  // Fast path: avoid JSON.parse on the vast majority of lines.
  if (!line.includes("token_count") || !line.includes("rate_limits")) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }

  const payload = (parsed as { payload?: { type?: unknown; rate_limits?: unknown } })?.payload;
  if (!payload || payload.type !== "token_count") {
    return undefined;
  }

  const rateLimits = payload.rate_limits as
    | ({ primary?: RawWindow; secondary?: RawWindow } & RawWindow)
    | undefined;
  if (!rateLimits || typeof rateLimits !== "object") {
    return undefined;
  }

  const windows: Array<{ window: "primary" | "secondary"; usedPercent: number; raw: RawWindow }> = [];
  const primaryPercent = asNumber(rateLimits.primary?.used_percent);
  if (primaryPercent !== undefined) {
    windows.push({ window: "primary", usedPercent: primaryPercent, raw: rateLimits.primary! });
  }
  const secondaryPercent = asNumber(rateLimits.secondary?.used_percent);
  if (secondaryPercent !== undefined) {
    windows.push({ window: "secondary", usedPercent: secondaryPercent, raw: rateLimits.secondary! });
  }
  // Older/flat schema: used_percent directly on rate_limits.
  if (windows.length === 0) {
    const flatPercent = asNumber(rateLimits.used_percent);
    if (flatPercent === undefined) {
      return undefined;
    }
    windows.push({ window: "primary", usedPercent: flatPercent, raw: rateLimits });
  }

  // Strictly-greater comparison: on a tie the earlier (primary) window wins.
  const limiting = windows.reduce((best, candidate) =>
    candidate.usedPercent > best.usedPercent ? candidate : best
  );

  return {
    usedPercent: limiting.usedPercent,
    limitingWindow: limiting.window,
    windowMinutes: asNumber(limiting.raw.window_minutes),
    resetsInSeconds: asNumber(limiting.raw.resets_in_seconds),
    primaryUsedPercent: primaryPercent,
    secondaryUsedPercent: secondaryPercent
  };
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

// Reads the newest Codex rate_limits event from ~/.codex/sessions (or baseDir).
// All failures (missing dirs, unreadable files, schema drift) resolve to
// undefined — the keyword-based detection in failure-detection.ts still covers
// those sessions. This function must never throw.
export const readCodexUsage = async (
  options: UsageProbeOptions = {}
): Promise<UsageSnapshot | undefined> => {
  const baseDir = options.baseDir ?? path.join(os.homedir(), ".codex");
  const now = options.now?.() ?? new Date();
  const maxDaysBack = options.maxDaysBack ?? 7;

  for (let dayOffset = 0; dayOffset <= maxDaysBack; dayOffset += 1) {
    const day = new Date(now.getTime() - dayOffset * 86_400_000);
    const dir = path.join(
      baseDir,
      "sessions",
      String(day.getFullYear()),
      pad2(day.getMonth() + 1),
      pad2(day.getDate())
    );

    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }

    const rollouts = names
      .filter((name) => name.startsWith("rollout-") && name.endsWith(".jsonl"))
      .sort()
      .reverse(); // filenames embed ISO timestamps → lexicographic == chronological

    for (const name of rollouts) {
      const filePath = path.join(dir, name);
      let content: string;
      try {
        content = await readFile(filePath, "utf8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const snapshot = parseRateLimitLine(lines[index] ?? "");
        if (snapshot) {
          return { ...snapshot, sourceFile: filePath };
        }
      }
    }
  }

  return undefined;
};

// Kind dispatcher — the extension point for future probes.
export const readProviderUsage = async (
  spec: UsageProbeSpec,
  options: UsageProbeOptions = {}
): Promise<UsageSnapshot | undefined> => {
  if (spec.kind === "codex-session-files") {
    return readCodexUsage(options);
  }
  return undefined;
};

export interface ResolvedUsageProbe {
  spec: UsageProbeSpec;
  thresholdPercent: number;
  pollIntervalMs: number;
}

// A probe is armed only when the provider declares one, the global toggle is on,
// and rate_limit is actually a fallback trigger for this provider. Providers
// without usageProbe (e.g. Claude Code) always resolve to undefined.
export const resolveUsageProbe = (
  provider: InteractiveProviderConfig,
  config: CodePassConfig
): ResolvedUsageProbe | undefined => {
  const spec = provider.usageProbe;
  const settings = config.harness.usageProbe;
  if (!spec || !settings.enabled) {
    return undefined;
  }
  const fallbackOn = provider.fallbackOn ?? config.fallbackOn;
  if (!fallbackOn.includes("rate_limit")) {
    return undefined;
  }
  return {
    spec,
    thresholdPercent: spec.thresholdPercent ?? settings.thresholdPercent,
    pollIntervalMs: settings.pollIntervalMs
  };
};

// Returns the snapshot only when usage is at/over the threshold; otherwise
// (including every read failure) undefined.
export const checkUsageThreshold = async (
  resolved: ResolvedUsageProbe,
  options: UsageProbeOptions = {}
): Promise<UsageSnapshot | undefined> => {
  try {
    const snapshot = await readProviderUsage(resolved.spec, options);
    return snapshot && snapshot.usedPercent >= resolved.thresholdPercent ? snapshot : undefined;
  } catch {
    return undefined;
  }
};

// Polls on an interval; fires onTrigger at most effectively-once (callers also
// guard with their own settled flag). Returns a stop() that must run in cleanup.
export const startUsageProbe = (
  resolved: ResolvedUsageProbe,
  options: UsageProbeOptions | undefined,
  onTrigger: (snapshot: UsageSnapshot) => void
): (() => void) => {
  let inFlight = false;
  let stopped = false;
  const timer = setInterval(() => {
    if (inFlight || stopped) {
      return;
    }
    inFlight = true;
    void checkUsageThreshold(resolved, options)
      .then((snapshot) => {
        if (snapshot && !stopped) {
          onTrigger(snapshot);
        }
      })
      .finally(() => {
        inFlight = false;
      });
  }, resolved.pollIntervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
};

const describeWindow = (snapshot: UsageSnapshot): string => {
  const minutes = snapshot.windowMinutes;
  if (minutes === undefined) return "usage";
  if (minutes >= 10_000) return "weekly";
  if (minutes >= 240 && minutes <= 360) return "5-hour";
  return `${Math.max(1, Math.round(minutes / 60))}-hour`;
};

// One-line, chalk-free message; callers add color and trailing action text.
export const formatUsageProbeMessage = (
  label: string,
  snapshot: UsageSnapshot,
  thresholdPercent: number
): string =>
  `CodePass usage probe: ${label} is at ${Math.round(snapshot.usedPercent)}% of its ` +
  `${describeWindow(snapshot)} limit (threshold ${thresholdPercent}%).`;
