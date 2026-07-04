import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentErrorType, InteractiveProviderConfig, CodePassConfig } from "./types.js";
import { formatGitContext, getChangedFiles, getGitContext } from "./git.js";

export interface HandoffPaths {
  livePath: string;
  archiveDir: string;
}

export interface HandoffCheckpoint {
  type: "session_start" | "tool_switch" | "session_end";
  timestamp?: string;
  fromProvider?: string;
  toProvider?: string;
  reason?: AgentErrorType;
  transcriptExcerpt?: string;
  note?: string;
}

const resolveConfiguredPath = (cwd: string, configuredPath: string): string =>
  path.isAbsolute(configuredPath) ? configuredPath : path.join(cwd, configuredPath);

export const getHandoffPaths = (cwd: string, config: CodePassConfig): HandoffPaths => ({
  livePath: resolveConfiguredPath(cwd, config.harness.handoffPath),
  archiveDir: resolveConfiguredPath(cwd, config.harness.handoffArchiveDir)
});

export const buildSessionPrompt = (
  handoffPath: string,
  providerChain: InteractiveProviderConfig[]
): string => [
  "You are running inside CodePass, a harness that can switch coding tools when limits happen.",
  "",
  `Keep this shared handoff file updated as you work: ${handoffPath}`,
  "",
  "The handoff file is the continuity layer for the next tool. Update it whenever the goal, plan, changed files, commands run, blockers, or next steps change.",
  "",
  `Provider chain: ${providerChain.map((provider) => provider.label).join(" -> ")}`,
  "",
  "Do not wait until the end. Keep the handoff useful for another coding agent at any moment."
].join("\n");

export const buildProviderHandoffPrompt = (
  handoffPath: string,
  fromProvider: string,
  toProvider: string,
  reason?: AgentErrorType
): string => [
  "You are continuing a CodePass coding session.",
  "",
  `Read this handoff file first: ${handoffPath}`,
  "",
  `Previous tool: ${fromProvider}`,
  `Current tool: ${toProvider}`,
  `Switch reason: ${reason ?? "unknown"}`,
  "",
  "CodePass cannot transfer private chat state. The handoff file is the shared continuity layer.",
  "After reading it, continue the work and keep the handoff file updated as you go."
].join("\n");

export const createHandoffFile = async (
  cwd: string,
  config: CodePassConfig,
  providerChain: InteractiveProviderConfig[],
  startedAt: string
): Promise<string> => {
  const paths = getHandoffPaths(cwd, config);
  const gitContext = await getGitContext(cwd, config.context.maxDiffChars);
  const changedFiles = await getChangedFiles(cwd);
  await mkdir(path.dirname(paths.livePath), { recursive: true });
  await mkdir(paths.archiveDir, { recursive: true });
  const content = [
    "# CodePass Handoff",
    "",
    "This file is shared by every tool in the current CodePass session.",
    "",
    "## Current Goal",
    "",
    "- User has not provided a separate session goal yet. Infer the goal from the live conversation and update this section.",
    "",
    "## Working State",
    "",
    "- Session just started.",
    "",
    "## Changed Files",
    "",
    "- None recorded yet.",
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
    "- Start by understanding the user's request and current repository state.",
    "",
    "## CodePass Checkpoints",
    "",
    `### Session started - ${startedAt}`,
    "",
    `- Working directory: ${cwd}`,
    `- Provider chain: ${providerChain.map((provider) => provider.label).join(" -> ")}`,
    `- Changed files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "none"}`,
    "- CodePass note: Keep this file updated as the work evolves.",
    "",
    "Repository snapshot:",
    "",
    "```txt",
    formatGitContext(gitContext),
    "```",
    ""
  ].join("\n");
  await writeFile(paths.livePath, content, "utf8");
  return paths.livePath;
};

export const appendHandoffCheckpoint = async (
  cwd: string,
  config: CodePassConfig,
  checkpoint: HandoffCheckpoint
): Promise<void> => {
  if (!config.harness.autoAppendCheckpoints) {
    return;
  }

  const paths = getHandoffPaths(cwd, config);
  await mkdir(path.dirname(paths.livePath), { recursive: true });
  const timestamp = checkpoint.timestamp ?? new Date().toISOString();
  const gitContext = await getGitContext(cwd, config.context.maxDiffChars);
  const changedFiles = await getChangedFiles(cwd);
  const heading =
    checkpoint.type === "session_start"
      ? "Session checkpoint"
      : checkpoint.type === "tool_switch"
        ? "Tool switch"
        : "Session ended";
  const block = [
    "",
    `### ${heading} - ${timestamp}`,
    "",
    checkpoint.fromProvider ? `- From: ${checkpoint.fromProvider}` : undefined,
    checkpoint.toProvider ? `- To: ${checkpoint.toProvider}` : undefined,
    checkpoint.reason ? `- Reason: ${checkpoint.reason}` : undefined,
    checkpoint.note ? `- Note: ${checkpoint.note}` : undefined,
    `- Changed files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "none"}`,
    "",
    "Repository snapshot:",
    "",
    "```txt",
    formatGitContext(gitContext),
    "```",
    checkpoint.transcriptExcerpt
      ? [
          "",
          "Recent transcript excerpt:",
          "",
          "```txt",
          checkpoint.transcriptExcerpt,
          "```"
        ].join("\n")
      : undefined,
    ""
  ].filter((line): line is string => line !== undefined).join("\n");

  await writeFile(paths.livePath, block, { encoding: "utf8", flag: "a" });
};

export const archiveHandoffFile = async (
  cwd: string,
  config: CodePassConfig,
  sessionId: string
): Promise<string | undefined> => {
  const paths = getHandoffPaths(cwd, config);

  try {
    await stat(paths.livePath);
  } catch {
    return undefined;
  }

  await mkdir(paths.archiveDir, { recursive: true });
  const archivePath = path.join(paths.archiveDir, `${sessionId}.md`);
  const content = await readFile(paths.livePath, "utf8");
  await writeFile(archivePath, content, "utf8");
  return archivePath;
};

export const summarizeHandoffFile = async (
  cwd: string,
  config: CodePassConfig
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
      summary: "No active CodePass handoff file exists yet."
    };
  }
};

export const clearHandoffArtifacts = async (
  cwd: string,
  config: CodePassConfig
): Promise<string[]> => {
  const paths = getHandoffPaths(cwd, config);
  const removed: string[] = [];
  const candidates = [
    path.dirname(paths.livePath),
    paths.archiveDir,
    path.isAbsolute(config.logs.sessionsDir)
      ? config.logs.sessionsDir
      : path.join(cwd, config.logs.sessionsDir)
  ];

  for (const candidate of candidates) {
    try {
      const entries = await readdir(candidate);
      await rm(candidate, { recursive: true, force: true });
      if (entries.length > 0) {
        removed.push(candidate);
      }
    } catch {
      // Nothing to clear.
    }
  }

  return removed;
};
