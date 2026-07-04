import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HarnessSessionLog, CodePassConfig } from "./types.js";

const safeTimestamp = (date: Date): string =>
  date.toISOString().replaceAll(":", "-").replaceAll(".", "-");

export const resolveSessionsDir = (cwd: string, config: CodePassConfig): string =>
  path.isAbsolute(config.logs.sessionsDir)
    ? config.logs.sessionsDir
    : path.join(cwd, config.logs.sessionsDir);

export const writeSessionLog = async (
  cwd: string,
  config: CodePassConfig,
  log: HarnessSessionLog
): Promise<string> => {
  const sessionsDir = resolveSessionsDir(cwd, config);
  await mkdir(sessionsDir, { recursive: true });

  const logPath = path.join(sessionsDir, `${safeTimestamp(new Date(log.startedAt))}.json`);
  await writeFile(logPath, `${JSON.stringify({ ...log, sessionLogPath: logPath }, null, 2)}\n`, "utf8");
  return logPath;
};

export const readLatestSessionLog = async (
  cwd: string,
  config: CodePassConfig
): Promise<HarnessSessionLog | undefined> => {
  const sessionsDir = resolveSessionsDir(cwd, config);

  try {
    const entries = (await readdir(sessionsDir))
      .filter((entry) => entry.endsWith(".json"))
      .sort();
    const latest = entries.at(-1);
    if (!latest) {
      return undefined;
    }

    const raw = await readFile(path.join(sessionsDir, latest), "utf8");
    return JSON.parse(raw) as HarnessSessionLog;
  } catch {
    return undefined;
  }
};
