import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ensureArtifactsIgnored } from "../util/artifacts.js";
import { agentErrorTypeSchema, DEFAULT_KEEPITMOVIN_DIR, DEFAULT_SESSIONS_DIR } from "../config/index.js";
import { redactSecrets } from "../util/redact.js";
import { ARTIFACT_FILE_MODE, resolveFromCwd } from "../util/paths.js";
import { reasoningEffortSchema, routingTierSchema } from "../routing/config.js";
import type { HarnessSessionLog, KeepitmovinConfig } from "../config/types.js";

const routeDecisionSchema = z.object({
  tier: routingTierSchema,
  reason: z.string(),
  signals: z.array(z.string()),
  source: z.enum(["classifier", "tier_override", "model_override"])
});

const appliedRouteSchema = routeDecisionSchema.extend({
  provider: z.string(),
  model: z.string().optional(),
  effort: reasoningEffortSchema.optional()
});

const harnessAttemptLogSchema = z.object({
  provider: z.string(),
  label: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  startedAt: z.string(),
  endedAt: z.string(),
  exitCode: z.number().nullable(),
  errorType: agentErrorTypeSchema.optional(),
  errorDetail: z.string().optional(),
  transcriptExcerpt: z.string(),
  route: appliedRouteSchema.optional(),
  handoffReceipt: z.object({
    status: z.enum(["received", "missing", "not_applicable"]),
    receivedAt: z.string().optional(),
    restatedGoal: z.string().optional(),
    nextAction: z.string().optional()
  }).optional(),
  compactionEvents: z.array(z.object({
    provider: z.string(),
    detectedAt: z.string(),
    source: z.enum(["claude-transcript", "codex-session-files"])
  })).optional(),
  watchdogEvents: z.array(z.object({
    type: z.enum(["loop", "burn", "stall"]),
    provider: z.string(),
    detectedAt: z.string(),
    detail: z.string()
  })).optional()
});

// Mirrors the HarnessSessionLog type. Session logs are read back from disk (where
// they can be corrupted or hand-edited), so validate rather than trust the shape.
const harnessSessionLogSchema = z.object({
  cwd: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  providerOrder: z.array(z.string()),
  attempts: z.array(harnessAttemptLogSchema),
  finalProvider: z.string().optional(),
  success: z.boolean(),
  changedFiles: z.array(z.string()),
  sessionLogPath: z.string().optional(),
  task: z.string().optional(),
  routeDecision: routeDecisionSchema.optional(),
  outcome: z.enum(["completed", "partial", "failed", "abandoned", "unknown"]).optional(),
  handoffQuality: z.object({
    taskInitialized: z.boolean(),
    narrativeUpdated: z.boolean(),
    missingSections: z.array(z.string()),
    placeholdersRemaining: z.array(z.string())
  }).optional()
});

const safeTimestamp = (date: Date): string =>
  date.toISOString().replaceAll(":", "-").replaceAll(".", "-");

export const resolveSessionsDir = (cwd: string, config: KeepitmovinConfig): string =>
  resolveFromCwd(cwd, DEFAULT_SESSIONS_DIR);

export const writeSessionLog = async (
  cwd: string,
  config: KeepitmovinConfig,
  log: HarnessSessionLog
): Promise<string> => {
  const sessionsDir = resolveSessionsDir(cwd, config);
  await mkdir(sessionsDir, { recursive: true, mode: 0o700 });
  await ensureArtifactsIgnored(path.join(cwd, DEFAULT_KEEPITMOVIN_DIR));

  const logPath = path.join(sessionsDir, `${safeTimestamp(new Date(log.startedAt))}.json`);
  const redactedLog: HarnessSessionLog = {
    ...log,
    attempts: log.attempts.map((attempt) => ({
      ...attempt,
      args: attempt.args.map((arg) => redactSecrets(arg)),
      ...(attempt.errorDetail ? { errorDetail: redactSecrets(attempt.errorDetail) } : {}),
      ...(attempt.handoffReceipt ? {
        handoffReceipt: {
          ...attempt.handoffReceipt,
          ...(attempt.handoffReceipt.restatedGoal
            ? { restatedGoal: redactSecrets(attempt.handoffReceipt.restatedGoal) }
            : {}),
          ...(attempt.handoffReceipt.nextAction
            ? { nextAction: redactSecrets(attempt.handoffReceipt.nextAction) }
            : {})
        }
      } : {}),
      transcriptExcerpt: redactSecrets(attempt.transcriptExcerpt)
    })),
    ...(log.task ? { task: redactSecrets(log.task) } : {})
  };
  await writeFile(
    logPath,
    `${JSON.stringify({ ...redactedLog, sessionLogPath: logPath }, null, 2)}\n`,
    { encoding: "utf8", mode: ARTIFACT_FILE_MODE }
  );
  return logPath;
};

export const readLatestSessionLog = async (
  cwd: string,
  config: KeepitmovinConfig
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
    const parsed = harnessSessionLogSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const readRecentSessionLogs = async (
  cwd: string,
  config: KeepitmovinConfig,
  limit = 10
): Promise<HarnessSessionLog[]> => {
  const sessionsDir = resolveSessionsDir(cwd, config);
  try {
    const entries = (await readdir(sessionsDir))
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .reverse();
    const logs: HarnessSessionLog[] = [];
    for (const entry of entries) {
      if (logs.length >= Math.max(0, limit)) break;
      try {
        const raw = await readFile(path.join(sessionsDir, entry), "utf8");
        const parsed = harnessSessionLogSchema.safeParse(JSON.parse(raw));
        if (parsed.success) logs.push(parsed.data);
      } catch {
        // One corrupt summary must not hide the other valid sessions.
      }
    }
    return logs;
  } catch {
    return [];
  }
};
