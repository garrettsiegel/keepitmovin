import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { CodePassConfig, RunAttemptLog, TaskContext } from "./types.js";
import { formatGitContext, getGitContext, getGitRoot, isGitRepo } from "./git.js";

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const result = await stat(filePath);
    return result.isFile();
  } catch {
    return false;
  }
};

const getSearchDirectories = async (cwd: string): Promise<string[]> => {
  const repo = await isGitRepo(cwd);
  const root = repo ? await getGitRoot(cwd) : cwd;
  const directories: string[] = [];
  let current = path.resolve(cwd);
  const stopAt = path.resolve(root ?? cwd);

  while (true) {
    directories.push(current);

    if (current === stopAt) {
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return directories;
};

export const loadProjectInstructions = async (
  cwd: string,
  instructionFiles: string[]
): Promise<string> => {
  const directories = await getSearchDirectories(cwd);
  const seen = new Set<string>();
  const chunks: string[] = [];

  for (const directory of directories) {
    for (const instructionFile of instructionFiles) {
      const filePath = path.join(directory, instructionFile);
      if (seen.has(filePath) || !(await fileExists(filePath))) {
        continue;
      }

      seen.add(filePath);
      const content = await readFile(filePath, "utf8");
      chunks.push(`--- ${path.relative(cwd, filePath) || instructionFile} ---\n${content.trim()}`);
    }
  }

  return chunks.join("\n\n");
};

export const summarizePreviousAttempts = (
  attempts: RunAttemptLog[]
): string => {
  if (attempts.length === 0) {
    return "No previous provider attempts.";
  }

  return attempts
    .map((attempt) => {
      const stderr = attempt.stderr.trim();
      const stdout = attempt.stdout.trim();
      const output = stderr || stdout;
      const outputSummary = output
        ? `\nOutput excerpt:\n${output.slice(0, 2_000)}`
        : "";

      return [
        `Provider: ${attempt.provider}`,
        `Success: ${attempt.success ? "yes" : "no"}`,
        `Exit code: ${attempt.exitCode ?? "none"}`,
        `Error type: ${attempt.errorType ?? "none"}`,
        `Duration: ${attempt.durationMs}ms`,
        `Changed files: ${attempt.changedFiles.length > 0 ? attempt.changedFiles.join(", ") : "none"}`,
        outputSummary
      ].join("\n");
    })
    .join("\n\n");
};

export const buildTaskContext = async (
  task: string,
  cwd: string,
  config: CodePassConfig,
  previousAttempts: RunAttemptLog[]
): Promise<TaskContext> => {
  const gitContext = config.context.includeGitStatus
    ? await getGitContext(cwd, config.context.maxDiffChars)
    : undefined;

  const instructions = config.context.includeProjectInstructions
    ? await loadProjectInstructions(cwd, config.context.instructionFiles)
    : "";

  return {
    task,
    cwd,
    repoContext: gitContext
      ? formatGitContext({
          ...gitContext,
          recentDiff: config.context.includeRecentDiff ? gitContext.recentDiff : ""
        })
      : "Git context disabled.",
    projectInstructions: instructions || "No project instruction files found.",
    previousAttemptSummary: summarizePreviousAttempts(previousAttempts)
  };
};
