import chalk from "chalk";
import { readFile } from "node:fs/promises";
import type {
  HarnessAttemptLog,
  HarnessSessionLog,
  InteractiveProviderConfig,
  KeepitmovinConfig,
  RouteDecision
} from "../config/types.js";
import { getChangedFiles } from "../util/git.js";
import { appendHandoffCheckpoint, archiveHandoffFile } from "../handoff/file.js";
import { assessHandoffQuality } from "../handoff/quality.js";
import { writeSessionLog } from "../session/log.js";

export interface FinalizeSessionOptions {
  cwd: string;
  config: KeepitmovinConfig;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  task?: string;
  routeDecision?: RouteDecision;
  startedAt: string;
  sessionId: string;
  handoffPath: string;
  sessionPrompt: string;
  handoffPrompt: string | undefined;
  providers: InteractiveProviderConfig[];
  attempts: HarnessAttemptLog[];
  finalProvider: string | undefined;
  success: boolean;
  aborted: boolean;
  meaningfulTranscriptExcerpt: (
    excerpt: string | undefined,
    transportPrompts: Array<string | undefined>
  ) => string | undefined;
}

/**
 * Closes out a session: the outcome prompt, the final checkpoint, the handoff
 * archive, and the session log. Split out of harness.ts, where runHarness had
 * grown past the project's 250-LOC limit.
 */
export const finalizeSession = async (
  options: FinalizeSessionOptions
): Promise<HarnessSessionLog> => {
  const {
    attempts,
    aborted,
    finalProvider,
    handoffPath,
    handoffPrompt,
    providers,
    sessionId,
    sessionPrompt,
    startedAt,
    success,
    meaningfulTranscriptExcerpt
  } = options;

  await appendHandoffCheckpoint(options.cwd, options.config, {
    type: "session_end",
    fromProvider: finalProvider,
    transcriptExcerpt: meaningfulTranscriptExcerpt(
      attempts.at(-1)?.transcriptExcerpt,
      [sessionPrompt, handoffPrompt]
    ),
    note: [
      aborted
        ? "You stopped the session with Ctrl-C."
        : success
          ? "The final provider process exited cleanly."
          : "The session ended without a clean provider exit.",
    ].filter(Boolean).join(" ")
  });
  const archivePath = await archiveHandoffFile(options.cwd, options.config, sessionId);
  if (archivePath) {
    options.output?.write(chalk.gray(`keepitmovin archived handoff: ${archivePath}\n`));
  }

  let handoffQuality;
  try {
    handoffQuality = assessHandoffQuality(await readFile(handoffPath, "utf8"));
  } catch {
    handoffQuality = undefined;
  }
  const log: HarnessSessionLog = {
    cwd: options.cwd,
    startedAt,
    endedAt: new Date().toISOString(),
    providerOrder: providers.map((provider) => provider.name),
    attempts,
    finalProvider,
    success,
    ...(aborted ? { aborted } : {}),
    changedFiles: await getChangedFiles(options.cwd),
    ...(options.task ? { task: options.task } : {}),
    ...(options.routeDecision ? { routeDecision: options.routeDecision } : {}),
    ...(handoffQuality ? { handoffQuality } : {})
  };
  const sessionLogPath = await writeSessionLog(options.cwd, options.config, log);
  options.output?.write(chalk.gray(`\nkeepitmovin session log: ${sessionLogPath}\n`));

  return { ...log, sessionLogPath };
};
