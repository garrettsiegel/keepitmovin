import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodePassConfig, RunLog } from "./types.js";

const safeTimestamp = (date: Date): string =>
  date.toISOString().replaceAll(":", "-").replaceAll(".", "-");

export const writeRunLog = async (
  cwd: string,
  config: CodePassConfig,
  log: RunLog
): Promise<string> => {
  const runsDir = path.isAbsolute(config.logs.runsDir)
    ? config.logs.runsDir
    : path.join(cwd, config.logs.runsDir);
  await mkdir(runsDir, { recursive: true });

  const logPath = path.join(runsDir, `${safeTimestamp(new Date(log.startedAt))}.json`);
  const serialized = config.logs.fullProviderOutput
    ? log
    : {
        ...log,
        attempts: log.attempts.map((attempt) => ({
          ...attempt,
          prompt: "[omitted: logs.fullProviderOutput=false]",
          stdout: attempt.stdout ? "[omitted: logs.fullProviderOutput=false]" : "",
          stderr: attempt.stderr ? "[omitted: logs.fullProviderOutput=false]" : ""
        }))
      };

  await writeFile(logPath, `${JSON.stringify(serialized, null, 2)}\n`, "utf8");
  return logPath;
};
