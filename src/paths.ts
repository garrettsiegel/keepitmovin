import os from "node:os";
import path from "node:path";

/**
 * Resolves a possibly-relative configured path against `cwd`. Absolute paths are
 * returned untouched. The single place keepitmovin turns a config path string into a
 * concrete filesystem path, so every module agrees on the same rules.
 */
export const resolveFromCwd = (cwd: string, configuredPath: string): string =>
  path.isAbsolute(configuredPath) ? configuredPath : path.join(cwd, configuredPath);

/**
 * True when `child` (resolved) is strictly inside `parent` (resolved) — a proper
 * descendant, never equal to `parent` itself.
 */
export const isStrictlyInside = (child: string, parent: string): boolean => {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);

  if (resolvedChild === resolvedParent) {
    return false;
  }

  const relative = path.relative(resolvedParent, resolvedChild);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
};

/**
 * Guards a recursive delete. A directory is safe to `rm -rf` only when it is
 * strictly inside `cwd` (or an explicitly configured absolute artifacts dir) AND
 * its path carries a `.keepitmovin` segment — never the cwd, an ancestor of it, the
 * home directory, the filesystem root, or the git repo root. This stops a
 * mis-set `handoffPath` like `"handoff.md"` (whose dirname is the cwd) from
 * wiping the whole project.
 */
export const isSafeToRecursivelyDelete = (
  candidate: string,
  cwd: string,
  options: { gitRoot?: string; allowedAbsoluteDirs?: string[] } = {}
): boolean => {
  const resolved = path.resolve(candidate);
  const forbidden = [
    path.resolve(cwd),
    os.homedir(),
    path.parse(resolved).root,
    ...(options.gitRoot ? [path.resolve(options.gitRoot)] : [])
  ];

  if (forbidden.includes(resolved)) {
    return false;
  }

  // Refuse any ancestor of the working directory.
  if (isStrictlyInside(cwd, resolved)) {
    return false;
  }

  const hasKeepitmovinSegment = resolved.split(path.sep).includes(".keepitmovin");
  const isAllowedAbsoluteDir = (options.allowedAbsoluteDirs ?? [])
    .map((dir) => path.resolve(dir))
    .includes(resolved);

  if (isAllowedAbsoluteDir) {
    return true;
  }

  return isStrictlyInside(resolved, cwd) && hasKeepitmovinSegment;
};
/**
 * Mode for artifacts keepitmovin persists (handoff files, session logs, the trust
 * store). These hold redacted-but-still-sensitive transcript excerpts, so they
 * are owner-only rather than the default 0644.
 */
export const ARTIFACT_FILE_MODE = 0o600;

/** Mode for the directories those artifacts live in. */
export const ARTIFACT_DIR_MODE = 0o700;

/**
 * Writes `content` to `file` atomically: to a sibling temp file first, then a
 * rename over the target.
 *
 * A plain writeFile truncates before it writes, so anything reading the file
 * concurrently — the next tool, `kim handoff`, the MCP server — can observe it
 * empty or half-written. The handoff file is the artifact the whole handoff
 * depends on, so a torn read there is the worst possible moment to lose it.
 * Rename is atomic within a filesystem, so a reader sees either the old file or
 * the new one, never a partial.
 */
export const writeFileAtomic = async (file: string, content: string): Promise<void> => {
  const { rename, writeFile, unlink } = await import("node:fs/promises");
  const temp = `${file}.kim-tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temp, content, { encoding: "utf8", mode: ARTIFACT_FILE_MODE });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
};
