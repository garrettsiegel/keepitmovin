import { readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { getGitRoot } from "./git.js";
import { isSafeToRecursivelyDelete, resolveFromCwd } from "./paths.js";
import type { CodePassConfig } from "./types.js";

export interface HandoffPaths {
  livePath: string;
  archiveDir: string;
}

export const getHandoffPaths = (cwd: string, config: CodePassConfig): HandoffPaths => ({
  livePath: resolveFromCwd(cwd, config.harness.handoffPath),
  archiveDir: resolveFromCwd(cwd, config.harness.handoffArchiveDir)
});

// Deletes only files matching `extension` (plus an optional exact file) inside
// `dir`, leaving the directory itself in place. Used as the safe fallback when a
// misconfigured artifact path resolves somewhere `rm -rf` must not touch.
const removeKnownFiles = async (
  dir: string,
  extension: string,
  extraFile?: string
): Promise<boolean> => {
  let removedAny = false;

  if (extraFile) {
    try {
      await unlink(extraFile);
      removedAny = true;
    } catch {
      // Nothing to remove.
    }
  }

  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (entry.endsWith(extension)) {
        await unlink(path.join(dir, entry)).catch(() => {});
        removedAny = true;
      }
    }
  } catch {
    // Directory missing — nothing to remove.
  }

  return removedAny;
};

export const clearHandoffArtifacts = async (
  cwd: string,
  config: CodePassConfig
): Promise<string[]> => {
  const paths = getHandoffPaths(cwd, config);
  const sessionsDir = resolveFromCwd(cwd, config.logs.sessionsDir);
  const gitRoot = await getGitRoot(cwd);
  const removed: string[] = [];

  // dir → the exact file / extension we may delete if the dir itself is unsafe
  // to recurse into.
  const candidates: Array<{ dir: string; extension: string; extraFile?: string }> = [
    { dir: path.dirname(paths.livePath), extension: ".md", extraFile: paths.livePath },
    { dir: paths.archiveDir, extension: ".md" },
    { dir: sessionsDir, extension: ".json" }
  ];

  for (const candidate of candidates) {
    if (isSafeToRecursivelyDelete(candidate.dir, cwd, { gitRoot: gitRoot ?? undefined })) {
      try {
        const entries = await readdir(candidate.dir);
        await rm(candidate.dir, { recursive: true, force: true });
        if (entries.length > 0) {
          removed.push(candidate.dir);
        }
      } catch {
        // Nothing to clear.
      }
      continue;
    }

    // Unsafe to recurse (e.g. handoffPath dirname resolved to the cwd or home).
    // Delete only the specific known artifact files and keep the directory.
    console.warn(
      `CodePass: ${candidate.dir} is not a dedicated .codepass directory; ` +
        `removing only known artifact files instead of the whole directory.`
    );
    if (await removeKnownFiles(candidate.dir, candidate.extension, candidate.extraFile)) {
      removed.push(candidate.dir);
    }
  }

  return removed;
};
