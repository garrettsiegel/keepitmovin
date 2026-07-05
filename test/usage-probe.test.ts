import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  checkUsageThreshold,
  formatUsageProbeMessage,
  readCodexUsage,
  resolveUsageProbe,
  startUsageProbe,
  type UsageSnapshot
} from "../src/usage-probe.js";
import type { InteractiveProviderConfig } from "../src/types.js";

const makeBaseDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-probe-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

const dayDir = (baseDir: string, date: Date): string =>
  path.join(
    baseDir,
    "sessions",
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  );

const writeRollout = async (
  baseDir: string,
  date: Date,
  fileName: string,
  lines: string[]
): Promise<void> => {
  await mkdir(dayDir(baseDir, date), { recursive: true });
  await writeFile(path.join(dayDir(baseDir, date), fileName), `${lines.join("\n")}\n`, "utf8");
};

const rateLimitLine = (primary: number, secondary: number): string =>
  JSON.stringify({
    timestamp: "2025-09-27T07:27:21.415Z",
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        primary: { used_percent: primary, window_minutes: 299, resets_in_seconds: 17_940 },
        secondary: { used_percent: secondary, window_minutes: 10_079, resets_in_seconds: 351_406 }
      }
    }
  });

const daysAgo = (base: Date, count: number): Date => new Date(base.getTime() - count * 86_400_000);

describe("readCodexUsage", () => {
  it("returns undefined when the base dir has no sessions", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();

    expect(await readCodexUsage({ baseDir, now: () => now })).toBeUndefined();
  });

  it("returns undefined for an empty rollout file", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [""]);

    expect(await readCodexUsage({ baseDir, now: () => now })).toBeUndefined();
  });

  it("reads the newest rate_limits event and reports the binding window", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [
      JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }),
      rateLimitLine(10, 22)
    ]);

    const snapshot = await readCodexUsage({ baseDir, now: () => now });

    expect(snapshot?.usedPercent).toBe(22);
    expect(snapshot?.limitingWindow).toBe("secondary");
    expect(snapshot?.windowMinutes).toBe(10_079);
    expect(snapshot?.sourceFile.endsWith("rollout-a.jsonl")).toBe(true);
  });

  it("uses the last event in the file", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [rateLimitLine(10, 20), rateLimitLine(50, 30)]);

    const snapshot = await readCodexUsage({ baseDir, now: () => now });

    expect(snapshot?.usedPercent).toBe(50);
    expect(snapshot?.limitingWindow).toBe("primary");
  });

  it("skips token_count events that have no rate_limits payload", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [
      rateLimitLine(5, 40),
      JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: {} } })
    ]);

    const snapshot = await readCodexUsage({ baseDir, now: () => now });

    expect(snapshot?.usedPercent).toBe(40);
  });

  it("tolerates malformed JSON lines without throwing", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [
      "{ token_count rate_limits garbage not json",
      rateLimitLine(3, 7)
    ]);

    const snapshot = await readCodexUsage({ baseDir, now: () => now });

    expect(snapshot?.usedPercent).toBe(7);
  });

  it("supports the flat rate_limits schema (used_percent directly)", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [
      JSON.stringify({ payload: { type: "token_count", rate_limits: { used_percent: 33 } } })
    ]);

    const snapshot = await readCodexUsage({ baseDir, now: () => now });

    expect(snapshot?.usedPercent).toBe(33);
    expect(snapshot?.limitingWindow).toBe("primary");
  });

  it("treats zero percent as a valid reading", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [rateLimitLine(0, 0)]);

    const snapshot = await readCodexUsage({ baseDir, now: () => now });

    expect(snapshot).toBeDefined();
    expect(snapshot?.usedPercent).toBe(0);
  });

  it("searches back across days", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, daysAgo(now, 3), "rollout-a.jsonl", [rateLimitLine(11, 60)]);

    const snapshot = await readCodexUsage({ baseDir, now: () => now });

    expect(snapshot?.usedPercent).toBe(60);
  });

  it("does not look beyond maxDaysBack", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, daysAgo(now, 9), "rollout-a.jsonl", [rateLimitLine(11, 60)]);

    expect(await readCodexUsage({ baseDir, now: () => now })).toBeUndefined();
  });

  it("prefers the newest file within a day", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-2025-09-27T07-00-00-aaa.jsonl", [rateLimitLine(90, 90)]);
    await writeRollout(baseDir, now, "rollout-2025-09-27T09-00-00-bbb.jsonl", [rateLimitLine(12, 5)]);

    const snapshot = await readCodexUsage({ baseDir, now: () => now });

    expect(snapshot?.usedPercent).toBe(12);
    expect(snapshot?.sourceFile.endsWith("rollout-2025-09-27T09-00-00-bbb.jsonl")).toBe(true);
  });
});

const codexProvider = (): InteractiveProviderConfig => {
  const provider = defaultConfig().harness.providers.find((entry) => entry.name === "codex");
  if (!provider) {
    throw new Error("missing Codex provider");
  }
  return provider;
};

describe("resolveUsageProbe", () => {
  it("returns undefined when the provider has no usageProbe", () => {
    const config = defaultConfig();
    const provider = { ...codexProvider(), usageProbe: undefined };

    expect(resolveUsageProbe(provider, config)).toBeUndefined();
  });

  it("returns undefined when the global probe is disabled", () => {
    const config = defaultConfig();
    config.harness.usageProbe.enabled = false;

    expect(resolveUsageProbe(codexProvider(), config)).toBeUndefined();
  });

  it("returns undefined when rate_limit is not an effective fallback trigger", () => {
    const config = defaultConfig();
    const provider = { ...codexProvider(), fallbackOn: ["timeout" as const] };

    expect(resolveUsageProbe(provider, config)).toBeUndefined();
  });

  it("resolves the global defaults for a probed provider", () => {
    const config = defaultConfig();

    expect(resolveUsageProbe(codexProvider(), config)).toEqual({
      spec: { kind: "codex-session-files" },
      thresholdPercent: 95,
      pollIntervalMs: 30_000
    });
  });

  it("lets a per-provider thresholdPercent override the global one", () => {
    const config = defaultConfig();
    const provider = { ...codexProvider(), usageProbe: { kind: "codex-session-files" as const, thresholdPercent: 80 } };

    expect(resolveUsageProbe(provider, config)?.thresholdPercent).toBe(80);
  });
});

describe("checkUsageThreshold", () => {
  it("returns undefined when usage is below the threshold", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [rateLimitLine(50, 50)]);
    const resolved = resolveUsageProbe(codexProvider(), defaultConfig())!;

    expect(await checkUsageThreshold(resolved, { baseDir, now: () => now })).toBeUndefined();
  });

  it("returns the snapshot when usage is at the threshold", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [rateLimitLine(95, 10)]);
    const resolved = resolveUsageProbe(codexProvider(), defaultConfig())!;

    const snapshot = await checkUsageThreshold(resolved, { baseDir, now: () => now });

    expect(snapshot?.usedPercent).toBe(95);
  });

  it("returns undefined when the base dir is missing", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    const resolved = resolveUsageProbe(codexProvider(), defaultConfig())!;

    expect(await checkUsageThreshold(resolved, { baseDir, now: () => now })).toBeUndefined();
  });
});

describe("formatUsageProbeMessage", () => {
  it("describes the weekly window", () => {
    const snapshot: UsageSnapshot = {
      usedPercent: 96,
      limitingWindow: "secondary",
      windowMinutes: 10_079,
      sourceFile: "rollout-a.jsonl"
    };

    expect(formatUsageProbeMessage("Codex", snapshot, 95)).toContain(
      "Codex is at 96% of its weekly limit (threshold 95%)"
    );
  });
});

describe("startUsageProbe", () => {
  it("fires onTrigger while running and stops after stop()", async () => {
    const baseDir = await makeBaseDir();
    const now = new Date();
    await writeRollout(baseDir, now, "rollout-a.jsonl", [rateLimitLine(99, 10)]);
    const resolved = { ...resolveUsageProbe(codexProvider(), defaultConfig())!, pollIntervalMs: 5 };

    let count = 0;
    const stop = startUsageProbe(resolved, { baseDir, now: () => now }, () => {
      count += 1;
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(count).toBeGreaterThan(0);

    stop();
    const afterStop = count;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(count).toBe(afterStop);
  });
});
