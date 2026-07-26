import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// A single `*` ignores everything inside `.keepitmovin/` (including this marker) so
// the directory itself is never committed. Self-contained: it needs no edit to
// the user's own .gitignore, which keeps secret-bearing handoff files and session
// logs out of the user's repo.
const MARKER_CONTENTS = "*\n";

/**
 * Ensures `<keepitmovinDir>/.gitignore` exists so nothing under `.keepitmovin/` is ever
 * tracked by the user's git repo. Idempotent. Returns true only when the marker
 * was newly created, so callers can print a one-time notice.
 */
export const ensureArtifactsIgnored = async (keepitmovinDir: string): Promise<boolean> => {
  const markerPath = path.join(keepitmovinDir, ".gitignore");

  try {
    await access(markerPath);
    return false;
  } catch {
    // Marker missing — create it below.
  }

  await mkdir(keepitmovinDir, { recursive: true });
  await writeFile(markerPath, MARKER_CONTENTS, "utf8");
  return true;
};
