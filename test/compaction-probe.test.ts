import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { startCompactionProbe } from "../src/probes/compaction.js";
import { makeTempDir } from "./support/tmp.js";

const tempDir = async (): Promise<string> => makeTempDir("kim-compaction");

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let index = 0; index < 40; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out waiting for probe");
};

describe("compaction probe", () => {
  it("detects a Claude compact boundary for the active cwd", async () => {
    const baseDir = await tempDir();
    const file = path.join(baseDir, "session.jsonl");
    await writeFile(file, "", "utf8");
    const onCompaction = vi.fn();
    const stop = startCompactionProbe({
      provider: "claude",
      spec: { kind: "claude-transcript" },
      cwd: "/tmp/project",
      startedAt: "2026-07-19T00:00:00.000Z",
      options: { baseDir, pollIntervalMs: 2 },
      onCompaction
    });
    await appendFile(file, `${JSON.stringify({
      type: "system", subtype: "compact_boundary", cwd: "/tmp/project",
      timestamp: "2026-07-19T00:01:00.000Z"
    })}\n`);
    await waitFor(() => onCompaction.mock.calls.length === 1);
    expect(onCompaction).toHaveBeenCalledWith(expect.objectContaining({ source: "claude-transcript" }));
    stop();
  });

  it("matches a Codex rollout to cwd and deduplicates paired events", async () => {
    const baseDir = await tempDir();
    const file = path.join(baseDir, "rollout.jsonl");
    const onCompaction = vi.fn();
    await writeFile(file, `${JSON.stringify({
      type: "turn_context", payload: { cwd: "/tmp/project" },
      timestamp: "2026-07-19T00:00:01.000Z"
    })}\n`, "utf8");
    const stop = startCompactionProbe({
      provider: "codex",
      spec: { kind: "codex-session-files" },
      cwd: "/tmp/project",
      startedAt: "2026-07-19T00:00:00.000Z",
      options: { baseDir, pollIntervalMs: 2, now: () => Date.parse("2026-07-19T00:02:00.000Z") },
      onCompaction
    });
    await appendFile(file,
      `${JSON.stringify({ type: "compacted", timestamp: "2026-07-19T00:01:00.000Z" })}\n` +
      `${JSON.stringify({ type: "event_msg", payload: { type: "context_compacted" }, timestamp: "2026-07-19T00:01:00.100Z" })}\n`
    );
    await waitFor(() => onCompaction.mock.calls.length === 1);
    expect(onCompaction).toHaveBeenCalledOnce();
    stop();
  });

  it("ignores malformed lines, old events, and other projects", async () => {
    const baseDir = await tempDir();
    await writeFile(path.join(baseDir, "session.jsonl"), [
      "not-json",
      JSON.stringify({ type: "system", subtype: "compact_boundary", cwd: "/other", timestamp: "2026-07-19T00:02:00.000Z" }),
      JSON.stringify({ type: "system", subtype: "compact_boundary", cwd: "/tmp/project", timestamp: "2026-07-18T23:00:00.000Z" })
    ].join("\n"), "utf8");
    const onCompaction = vi.fn();
    const stop = startCompactionProbe({
      provider: "claude",
      spec: { kind: "claude-transcript" },
      cwd: "/tmp/project",
      startedAt: "2026-07-19T00:00:00.000Z",
      options: { baseDir, pollIntervalMs: 2 },
      onCompaction
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onCompaction).not.toHaveBeenCalled();
    stop();
  });
});
