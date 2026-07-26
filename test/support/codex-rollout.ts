import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Codex usage-probe rollout fixtures. test/harness.test.ts carried a verbatim
// copy of these and said so in a comment; both suites now share this module.
// Codex usage-probe fixture helpers (mirror of test/usage-probe.test.ts).
export const dayDir = (baseDir: string, date: Date): string =>
  path.join(
    baseDir,
    "sessions",
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  );

export const writeRollout = async (
  baseDir: string,
  date: Date,
  fileName: string,
  lines: string[]
): Promise<void> => {
  await mkdir(dayDir(baseDir, date), { recursive: true });
  await writeFile(path.join(dayDir(baseDir, date), fileName), `${lines.join("\n")}\n`, "utf8");
};

export const rateLimitLine = (primary: number, secondary: number): string =>
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
