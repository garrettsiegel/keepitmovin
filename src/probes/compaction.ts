import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CompactionEventLog, CompactionProbeSpec, ProviderName } from "../config/types.js";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const COMPACTION_COOLDOWN_MS = 30_000;

interface FileState {
  offset: number;
  matchesCwd: boolean;
}

export interface CompactionProbeOptions {
  baseDir?: string;
  pollIntervalMs?: number;
  homeDir?: string;
  now?: () => number;
}

const encodedClaudeProject = (cwd: string): string => cwd.replace(/[^A-Za-z0-9]/g, "-");

const dateParts = (timestamp: number): string[] => {
  const date = new Date(timestamp);
  return [
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ];
};

export const resolveCompactionProbeDir = (
  spec: CompactionProbeSpec,
  cwd: string,
  startedAtMs: number,
  options: CompactionProbeOptions = {}
): string => {
  if (options.baseDir) return options.baseDir;
  const home = options.homeDir ?? os.homedir();
  return spec.kind === "claude-transcript"
    ? path.join(home, ".claude", "projects", encodedClaudeProject(cwd))
    : path.join(home, ".codex", "sessions", ...dateParts(startedAtMs));
};

const parseJsonLine = (line: string): Record<string, unknown> | undefined => {
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
};

const timestampMs = (record: Record<string, unknown>): number | undefined => {
  if (typeof record.timestamp !== "string") return undefined;
  const value = Date.parse(record.timestamp);
  return Number.isFinite(value) ? value : undefined;
};

const codexPayload = (record: Record<string, unknown>): Record<string, unknown> | undefined =>
  record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
    ? record.payload as Record<string, unknown>
    : undefined;

const listJsonlFiles = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { recursive: true });
    return entries
      .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".jsonl"))
      .map((entry) => path.join(directory, entry));
  } catch {
    return [];
  }
};

export const startCompactionProbe = (args: {
  provider: ProviderName;
  spec: CompactionProbeSpec;
  cwd: string;
  startedAt: string;
  options?: CompactionProbeOptions;
  onCompaction: (event: CompactionEventLog) => void | Promise<void>;
}): (() => void) => {
  const startedAtMs = Date.parse(args.startedAt);
  const options = args.options ?? {};
  const directory = resolveCompactionProbeDir(args.spec, args.cwd, startedAtMs, options);
  const files = new Map<string, FileState>();
  const seenBuckets = new Set<number>();
  let stopped = false;
  let polling = false;
  let lastEmittedAt = 0;

  const processLines = (lines: string[], state: FileState): void => {
    for (const line of lines) {
      const record = parseJsonLine(line);
      if (!record) continue;
      const payload = codexPayload(record);

      if (args.spec.kind === "codex-session-files" && record.type === "turn_context") {
        if (payload?.cwd === args.cwd) state.matchesCwd = true;
        else if (typeof payload?.cwd === "string") state.matchesCwd = false;
      }

      const matchingClaude =
        args.spec.kind === "claude-transcript" &&
        record.type === "system" &&
        record.subtype === "compact_boundary" &&
        record.cwd === args.cwd;
      const matchingCodex =
        args.spec.kind === "codex-session-files" &&
        state.matchesCwd &&
        ((record.type === "event_msg" && payload?.type === "context_compacted") ||
          record.type === "compacted");
      if (!matchingClaude && !matchingCodex) continue;

      const eventTime = timestampMs(record);
      if (!eventTime || eventTime < startedAtMs) continue;
      const bucket = Math.floor(eventTime / 1_000);
      if (seenBuckets.has(bucket)) continue;
      seenBuckets.add(bucket);
      const now = options.now?.() ?? Date.now();
      if (lastEmittedAt && now - lastEmittedAt < COMPACTION_COOLDOWN_MS) continue;
      lastEmittedAt = now;
      void args.onCompaction({
        provider: args.provider,
        detectedAt: new Date(eventTime).toISOString(),
        source: args.spec.kind
      });
    }
  };

  const poll = async (): Promise<void> => {
    if (stopped || polling) return;
    polling = true;
    try {
      for (const file of await listJsonlFiles(directory)) {
        let content: Buffer;
        try {
          content = await readFile(file);
        } catch {
          continue;
        }
        const state = files.get(file) ?? { offset: 0, matchesCwd: false };
        if (content.length < state.offset) {
          state.offset = 0;
          state.matchesCwd = false;
        }
        const chunk = content.subarray(state.offset).toString("utf8");
        state.offset = content.length;
        files.set(file, state);
        processLines(chunk.split(/\r?\n/), state);
      }
    } finally {
      polling = false;
    }
  };

  void poll();
  const interval = setInterval(() => void poll(), options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  interval.unref?.();
  return () => {
    stopped = true;
    clearInterval(interval);
  };
};
