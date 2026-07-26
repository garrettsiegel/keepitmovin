import { writeFile } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "./support/tmp.js";
import {
  formatChangedFiles,
  formatGitSnapshot,
  getChangedFiles,
  getGitContext,
  isGitRepo
} from "../src/util/git.js";


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

  it("caps mechanical handoff lists and avoids duplicate status/name dumps", () => {
    const files = Array.from({ length: 55 }, (_, index) => `src/file-${index}.ts`);
    const snapshot = formatGitSnapshot({
      isGitRepo: true,
      root: "/repo",
      statusShort: files.map((file) => ` M ${file}`).join("\n"),
      diffStat: Array.from({ length: 25 }, (_, index) => ` src/file-${index}.ts | 1 +`).join("\n"),
      diffNameOnly: files.join("\n"),
      recentDiff: "",
      changedFiles: files
    });

    expect(formatChangedFiles(files).split("\n")).toHaveLength(51);
    expect(formatChangedFiles(files)).toContain("5 more changed files");
    expect(snapshot).toContain("Changed entries: 55");
    expect(snapshot).toContain("5 more diff-stat lines");
    expect(snapshot).not.toContain("git status --short");
    expect(snapshot).not.toContain("git diff --name-only");
  });
});

describe("getChangedFiles — real repository", () => {
  const git = async (cwd: string, args: string[]): Promise<void> => {
    await execa("git", args, { cwd });
  };

  const makeRepo = async (): Promise<string> => {
    const dir = await makeTempDir();
    await git(dir, ["init", "--initial-branch=main"]);
    await git(dir, ["config", "user.email", "test@example.com"]);
    await git(dir, ["config", "user.name", "Test"]);
    await git(dir, ["commit", "--allow-empty", "-m", "init"]);
    return dir;
  };

  it("lists both sides of a rename as separate files", async () => {
    // `git status --short` renders a rename as "R  old.ts -> new.ts" on one line,
    // which the old slice(3) parsing turned into a single bogus entry.
    const dir = await makeRepo();
    await writeFile(path.join(dir, "old.ts"), "export const a = 1;\n", "utf8");
    await git(dir, ["add", "old.ts"]);
    await git(dir, ["commit", "-m", "add"]);
    await git(dir, ["mv", "old.ts", "new.ts"]);

    const changed = await getChangedFiles(dir);
    expect(changed).toContain("new.ts");
    expect(changed).toContain("old.ts");
    expect(changed.some((file) => file.includes("->"))).toBe(false);
  });

  it("handles a path containing a space without quote artifacts", async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, "my notes.md"), "hello\n", "utf8");

    const changed = await getChangedFiles(dir);
    expect(changed).toContain("my notes.md");
    expect(changed.some((file) => file.startsWith('"'))).toBe(false);
  });

  it("lists an ordinary modification", async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, "a.ts"), "x\n", "utf8");
    await git(dir, ["add", "a.ts"]);
    await git(dir, ["commit", "-m", "a"]);
    await writeFile(path.join(dir, "a.ts"), "y\n", "utf8");

    expect(await getChangedFiles(dir)).toEqual(["a.ts"]);
  });
});
