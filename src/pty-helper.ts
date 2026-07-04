import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const EXEC_BITS = 0o111;

/**
 * Adds user/group/other execute bits to a file when any are missing. Returns
 * true if it changed the mode. No-op (returns false) when the file is absent or
 * already executable.
 */
export const addExecutableBits = (filePath: string): boolean => {
  if (!existsSync(filePath)) {
    return false;
  }

  const { mode } = statSync(filePath);
  if ((mode & EXEC_BITS) === EXEC_BITS) {
    return false;
  }

  chmodSync(filePath, mode | EXEC_BITS);
  return true;
};

const findNodePtyRoot = (): string | undefined => {
  try {
    const require = createRequire(import.meta.url);
    let dir = path.dirname(require.resolve("node-pty"));

    for (let depth = 0; depth < 6; depth += 1) {
      if (existsSync(path.join(dir, "prebuilds")) || existsSync(path.join(dir, "build"))) {
        return dir;
      }

      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  } catch {
    // node-pty not resolvable; nothing to fix.
  }

  return undefined;
};

let checked = false;

/**
 * node-pty ships a prebuilt `spawn-helper` binary that must be executable. Some
 * installs (notably pnpm) drop its exec bit, which makes `pty.spawn` throw
 * `posix_spawnp failed` — CodePass then silently degrades to non-interactive pipes
 * and interactive tools like Claude Code hang. Restore the exec bit at startup.
 * Best-effort and idempotent; no-op on Windows.
 */
export const ensurePtyHelperExecutable = (): void => {
  if (checked || process.platform === "win32") {
    return;
  }

  checked = true;
  const root = findNodePtyRoot();
  if (!root) {
    return;
  }

  const candidates = [
    path.join(root, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    path.join(root, "build", "Release", "spawn-helper")
  ];

  for (const candidate of candidates) {
    try {
      addExecutableBits(candidate);
    } catch {
      // Best effort — fall through to the pipe fallback if this fails.
    }
  }
};
