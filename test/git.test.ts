import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getChangedFiles, getGitContext, isGitRepo } from "../src/git.js";

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-git-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

describe("git helpers", () => {
  it("degrades cleanly outside a git repository", async () => {
    const cwd = await makeTempDir();

    await expect(isGitRepo(cwd)).resolves.toBe(false);
    await expect(getChangedFiles(cwd)).resolves.toEqual([]);
    await expect(getGitContext(cwd, 1_000)).resolves.toMatchObject({
      isGitRepo: false,
      changedFiles: []
    });
  });
});
