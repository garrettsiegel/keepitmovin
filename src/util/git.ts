import { execa } from "execa";
import type { GitContext } from "../config/types.js";

const runGitRaw = async (cwd: string, args: string[]): Promise<string> => {
  try {
    const result = await execa("git", args, {
      cwd,
      reject: false,
      stdout: "pipe",
      stderr: "pipe"
    });

    return result.exitCode === 0 ? result.stdout : "";
  } catch {
    return "";
  }
};

const runGit = async (cwd: string, args: string[]): Promise<string> =>
  (await runGitRaw(cwd, args)).trim();

export const isGitRepo = async (cwd: string): Promise<boolean> => {
  const result = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return result === "true";
};

export const getGitRoot = async (cwd: string): Promise<string | undefined> => {
  const root = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return root || undefined;
};

export const getChangedFiles = async (cwd: string): Promise<string[]> => {
  // -z gives NUL-separated entries with paths verbatim, so paths containing
  // spaces or non-ASCII characters need no unquoting. Plain `--short` also
  // collapsed a rename into one bogus entry ("old.ts -> new.ts") because the
  // arrow is part of the line rather than a separator.
  // Raw, not trimmed: porcelain entries are "XY <path>" and an unstaged change
  // leads with a space, which trimming would eat and shift the path offset.
  const status = await runGitRaw(cwd, ["status", "--porcelain", "-z"]);
  if (!status) {
    return [];
  }

  const entries = status.split("\0");
  const files: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }

    const code = entry.slice(0, 2);
    files.push(entry.slice(3));

    // A rename/copy is emitted as "R  <new>\0<old>\0" — the following NUL-
    // separated field is the source path and must not be read as another entry.
    if (code.startsWith("R") || code.startsWith("C")) {
      const source = entries[index + 1];
      if (source) {
        files.push(source);
      }
      index += 1;
    }
  }

  return [...new Set(files.filter(Boolean))].sort();
};

const NOT_A_REPO: GitContext = {
  isGitRepo: false,
  statusShort: "",
  diffStat: "",
  diffNameOnly: "",
  recentDiff: "",
  changedFiles: []
};

/**
 * Reads the working-tree state. `maxDiffChars` opts into the expensive part —
 * a full `git diff -- .`, truncated to that many characters. Omit it (or use
 * getGitSnapshot) when only the status and changed-file list are needed.
 */
export const getGitContext = async (
  cwd: string,
  maxDiffChars?: number
): Promise<GitContext> => {
  if (!(await isGitRepo(cwd))) {
    return { ...NOT_A_REPO };
  }

  const wantsDiff = maxDiffChars !== undefined;
  const [root, statusShort, diffStat, diffNameOnly, changedFiles, rawDiff] = await Promise.all([
    getGitRoot(cwd),
    runGit(cwd, ["status", "--short"]),
    runGit(cwd, ["diff", "--stat"]),
    runGit(cwd, ["diff", "--name-only"]),
    getChangedFiles(cwd),
    wantsDiff ? runGit(cwd, ["diff", "--", "."]) : Promise.resolve("")
  ]);

  const recentDiff =
    wantsDiff && rawDiff.length > maxDiffChars
      ? `${rawDiff.slice(0, maxDiffChars)}\n\n[Diff truncated at ${maxDiffChars} characters]`
      : rawDiff;

  return { isGitRepo: true, root, statusShort, diffStat, diffNameOnly, recentDiff, changedFiles };
};

/** getGitContext without the full-diff read. */
export const getGitSnapshot = (cwd: string): Promise<GitContext> => getGitContext(cwd);

export const formatGitSnapshot = (context: GitContext): string => {
  if (!context.isGitRepo) {
    return "No git repository detected.";
  }

  return [
    `Git root: ${context.root ?? "unknown"}`,
    "",
    `Changed entries: ${context.changedFiles.length}`,
    "",
    "git diff --stat (capped):",
    formatCappedLines(context.diffStat, 20, "diff-stat lines") || "(no unstaged diff)"
  ].join("\n");
};

const formatCappedLines = (value: string, limit: number, label: string): string => {
  const lines = value.split("\n").filter(Boolean);
  if (lines.length <= limit) {
    return lines.join("\n");
  }
  return [...lines.slice(0, limit), `[${lines.length - limit} more ${label}; inspect the repository directly]`]
    .join("\n");
};

export const formatChangedFiles = (files: string[], limit = 50): string => {
  const visible = files.slice(0, limit).map((file) => `- ${file}`);
  if (files.length > limit) {
    visible.push(`- [${files.length - limit} more changed files; run git status --short]`);
  }
  return visible.length > 0 ? visible.join("\n") : "- None.";
};
