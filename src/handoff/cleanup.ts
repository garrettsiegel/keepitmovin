import { readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { getGitRoot } from "../util/git.js";
import { isSafeToRecursivelyDelete, isStrictlyInside, resolveFromCwd } from "../util/paths.js";
import {
  DEFAULT_HANDOFF_ARCHIVE_DIR,
  DEFAULT_HANDOFF_PATH,
  DEFAULT_SESSIONS_DIR
} from "../config/config-schema.js";
import type { KeepitmovinConfig } from "../config/types.js";

export interface HandoffPaths {
  livePath: string;
  archiveDir: string;
}

export const getHandoffPaths = (cwd: string, config: KeepitmovinConfig): HandoffPaths => ({
  livePath: resolveFromCwd(cwd, DEFAULT_HANDOFF_PATH),
  archiveDir: resolveFromCwd(cwd, DEFAULT_HANDOFF_ARCHIVE_DIR)
});

const removeExactFile = async (file: string | undefined): Promise<boolean> => {
  if (!file) {
    return false;
  }

  try {
    await unlink(file);
    return true;
  } catch {
    return false;
  }
};

export const clearHandoffArtifacts = async (
  cwd: string,
  config: KeepitmovinConfig
): Promise<string[]> => {
  const paths = getHandoffPaths(cwd, config);
  const sessionsDir = resolveFromCwd(cwd, DEFAULT_SESSIONS_DIR);
  const gitRoot = await getGitRoot(cwd);
  const removed: string[] = [];
  const exactLiveFile = isStrictlyInside(paths.livePath, cwd) &&
    path.basename(paths.livePath) === "handoff.md"
    ? paths.livePath
    : undefined;

  // Only the live handoff has an exact safe fallback. Archive/session directories
  // are all-or-nothing: an unsafe directory is never enumerated.
  const candidates: Array<{ dir: string; exactFile?: string }> = [
    { dir: path.dirname(paths.livePath), exactFile: exactLiveFile },
    { dir: paths.archiveDir },
    { dir: sessionsDir }
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

    // Unsafe to recurse (e.g. a configured path resolves to cwd or home). Never
    // scan by extension here: that could delete unrelated user files.
    console.warn(
      `keepitmovin: ${candidate.dir} is not a dedicated .keepitmovin directory; ` +
        `${candidate.exactFile ? "removing only the exact live handoff" : "leaving it untouched"}.`
    );
    if (await removeExactFile(candidate.exactFile)) {
      removed.push(candidate.dir);
    }
  }

  return removed;
};
