import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentErrorType, InteractiveProviderConfig, KeepitmovinConfig } from "./types.js";
import { formatChangedFiles, formatGitSnapshot, getChangedFiles, getGitSnapshot } from "./git.js";
import { getHandoffPaths } from "./handoff-artifacts.js";
import {
  appendSwitchHistoryLine,
  refreshHandoffFile,
  replaceSection,
  SWITCH_HISTORY_LIMIT,
  TRANSCRIPT_EXCERPT_LIMIT
} from "./handoff-refresh.js";
import { ensureArtifactsIgnored } from "./artifacts.js";
import { DEFAULT_KEEPITMOVIN_DIR } from "./config.js";
import { redactSecrets } from "./redact.js";
import { ARTIFACT_FILE_MODE, writeFileAtomic } from "./paths.js";

export { buildProviderHandoffPrompt, buildSessionPrompt } from "./handoff-prompts.js";
export { clearHandoffArtifacts, getHandoffPaths, type HandoffPaths } from "./handoff-artifacts.js";

export interface HandoffCheckpoint {
  type: "session_start" | "tool_switch" | "session_end";
  timestamp?: string;
  fromProvider?: string;
  toProvider?: string;
  reason?: AgentErrorType;
  transcriptExcerpt?: string;
  note?: string;
}

export const createHandoffFile = async (
  cwd: string,
  config: KeepitmovinConfig,
  providerChain: InteractiveProviderConfig[],
  startedAt: string,
  task?: string
): Promise<string> => {
  const paths = getHandoffPaths(cwd, config);
  const gitContext = await getGitSnapshot(cwd);
  const changedFiles = await getChangedFiles(cwd);
  await mkdir(path.dirname(paths.livePath), { recursive: true, mode: 0o700 });
  await mkdir(paths.archiveDir, { recursive: true, mode: 0o700 });
  await ensureArtifactsIgnored(path.join(cwd, DEFAULT_KEEPITMOVIN_DIR));
  let stale: string | undefined;
  try {
    stale = await readFile(paths.livePath, "utf8");
  } catch {
    // No stale live handoff to recover.
  }
  if (stale !== undefined) {
    const safeStartedAt = startedAt.replaceAll(":", "-").replaceAll(".", "-");
    await writeFile(path.join(paths.archiveDir, `recovered-${safeStartedAt}.md`), stale, {
      encoding: "utf8",
      mode: ARTIFACT_FILE_MODE
    });
  }
  const content = [
    "# keepitmovin Handoff",
    "",
    "This file is shared by every tool in the current keepitmovin session.",
    "keepitmovin automatically maintains: Changed Files, Repository Snapshot, Switch History,",
    "and Latest Transcript Excerpt. Write your notes in the other sections only.",
    "",
    "## Current Goal",
    "",
    task
      ? `- ${redactSecrets(task)}`
      : "- User has not provided a separate session goal yet. Infer the goal from the live conversation and update this section.",
    "",
    "## Working State",
    "",
    "- Session just started.",
    "",
    "## Commands And Checks",
    "",
    "- None recorded yet.",
    "",
    "## Blockers",
    "",
    "- None recorded yet.",
    "",
    "## Next Step",
    "",
    task
      ? "- Begin the task above and keep this handoff current after each meaningful subtask."
      : "- Start by understanding the user's request and current repository state.",
    "",
    "## Changed Files",
    "",
    formatChangedFiles(changedFiles),
    "",
    "## Repository Snapshot",
    "",
    `Last refreshed: ${startedAt}`,
    "",
    "```txt",
    redactSecrets(formatGitSnapshot(gitContext)),
    "```",
    "",
    "## Switch History",
    "",
    `- ${startedAt} — Session started (${providerChain.map((provider) => provider.label).join(" → ")}) — cwd: ${cwd}`,
    "",
    "## Latest Transcript Excerpt",
    "",
    "- None yet.",
    ""
  ].join("\n");
  await writeFileAtomic(paths.livePath, content);
  return paths.livePath;
};

export const appendHandoffCheckpoint = async (
  cwd: string,
  config: KeepitmovinConfig,
  checkpoint: HandoffCheckpoint
): Promise<void> => {
  if (!config.harness.autoAppendCheckpoints) {
    return;
  }

  const paths = getHandoffPaths(cwd, config);
  const timestamp = checkpoint.timestamp ?? new Date().toISOString();
  let content: string;
  try {
    content = await readFile(paths.livePath, "utf8");
  } catch {
    return; // No live handoff — nothing to checkpoint into.
  }

  const note = checkpoint.note ? checkpoint.note.slice(0, 300) : undefined;
  const line =
    checkpoint.type === "tool_switch"
      ? `- ${timestamp} — ${checkpoint.fromProvider ?? "?"} → ${checkpoint.toProvider ?? "(none)"} — Reason: ${checkpoint.reason ?? "unknown"}${note ? ` — ${note}` : ""}`
      : `- ${timestamp} — ${checkpoint.type === "session_end" ? "Session ended" : "Checkpoint"}${checkpoint.fromProvider ? ` (${checkpoint.fromProvider})` : ""}${note ? ` — ${note}` : ""}`;

  content = appendSwitchHistoryLine(content, line, SWITCH_HISTORY_LIMIT);

  if (checkpoint.transcriptExcerpt) {
    const excerpt = redactSecrets(checkpoint.transcriptExcerpt).slice(-TRANSCRIPT_EXCERPT_LIMIT);
    content = replaceSection(
      content,
      "Latest Transcript Excerpt",
      ["```txt", excerpt, "```"].join("\n")
    );
  }

  await writeFileAtomic(paths.livePath, content);
  await refreshHandoffFile(cwd, config, paths.livePath);
};

export const archiveHandoffFile = async (
  cwd: string,
  config: KeepitmovinConfig,
  sessionId: string
): Promise<string | undefined> => {
  const paths = getHandoffPaths(cwd, config);

  try {
    await stat(paths.livePath);
  } catch {
    return undefined;
  }

  await mkdir(paths.archiveDir, { recursive: true, mode: 0o700 });
  const archivePath = path.join(paths.archiveDir, `${sessionId}.md`);
  const content = await readFile(paths.livePath, "utf8");
  await writeFile(archivePath, content, { encoding: "utf8", mode: ARTIFACT_FILE_MODE });
  return archivePath;
};

export const summarizeHandoffFile = async (
  cwd: string,
  config: KeepitmovinConfig
): Promise<{ path: string; exists: boolean; summary: string }> => {
  const paths = getHandoffPaths(cwd, config);

  try {
    const content = await readFile(paths.livePath, "utf8");
    return {
      path: paths.livePath,
      exists: true,
      summary: content.slice(0, 2_000)
    };
  } catch {
    return {
      path: paths.livePath,
      exists: false,
      summary: "No active keepitmovin handoff file exists yet."
    };
  }
};
