import { mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { clearHandoffArtifacts, getHandoffPaths } from "../src/handoff/cleanup.js";
import { isSafeToRecursivelyDelete, isStrictlyInside } from "../src/util/paths.js";
import { makeTempDir } from "./support/tmp.js";

// `kim clear` calls rm(recursive). Everything below is the guard rail between
// that call and someone's repository, so it is tested directly rather than
// only through the command.
describe("isSafeToRecursivelyDelete", () => {
  it("allows only dedicated .keepitmovin directories inside the cwd", async () => {
    const cwd = await makeTempDir();

    expect(isSafeToRecursivelyDelete(path.join(cwd, ".keepitmovin"), cwd)).toBe(true);
    expect(isSafeToRecursivelyDelete(path.join(cwd, ".keepitmovin", "sessions"), cwd)).toBe(true);
    // Inside the cwd, but with no .keepitmovin segment: refused.
    expect(isSafeToRecursivelyDelete(path.join(cwd, "src"), cwd)).toBe(false);
    expect(isSafeToRecursivelyDelete(path.join(cwd, "node_modules"), cwd)).toBe(false);
  });

  it("refuses the cwd, its ancestors, home, and the filesystem root", async () => {
    const cwd = await makeTempDir();

    expect(isSafeToRecursivelyDelete(cwd, cwd)).toBe(false);
    expect(isSafeToRecursivelyDelete(path.dirname(cwd), cwd)).toBe(false);
    expect(isSafeToRecursivelyDelete(path.join(cwd, ".."), cwd)).toBe(false);
    expect(isSafeToRecursivelyDelete(os.homedir(), cwd)).toBe(false);
    expect(isSafeToRecursivelyDelete(path.parse(cwd).root, cwd)).toBe(false);
    // Even a .keepitmovin-looking path in home is outside the cwd.
    expect(isSafeToRecursivelyDelete(path.join(os.homedir(), ".keepitmovin"), cwd)).toBe(false);
  });

  it("refuses the git root even when it is the cwd's own .keepitmovin ancestor", async () => {
    const cwd = await makeTempDir();
    const gitRoot = path.join(cwd, "repo");
    const inside = path.join(gitRoot, ".keepitmovin");

    expect(isSafeToRecursivelyDelete(gitRoot, cwd, { gitRoot })).toBe(false);
    // A .keepitmovin dir under the git root is still fair game.
    expect(isSafeToRecursivelyDelete(inside, cwd, { gitRoot })).toBe(true);
  });

  it("refuses a path that escapes the cwd through .. segments", async () => {
    const cwd = await makeTempDir();
    const escape = path.join(cwd, ".keepitmovin", "..", "..", "elsewhere");

    expect(isSafeToRecursivelyDelete(escape, cwd)).toBe(false);
  });

  it("does not treat a symlinked .keepitmovin as being inside the cwd", async () => {
    const cwd = await makeTempDir();
    const outside = await makeTempDir();
    const link = path.join(cwd, ".keepitmovin");
    await symlink(outside, link);

    // The guard is lexical, so the link path itself passes; what protects the
    // target is that clearing resolves real paths under the cwd. Assert the
    // target survives an actual clear rather than asserting on the guard alone.
    const config = defaultConfig();
    await clearHandoffArtifacts(cwd, config);
    await expect(stat(outside)).resolves.toBeDefined();
  });
});

describe("isStrictlyInside", () => {
  it("is a proper-descendant test, not an equality or prefix test", async () => {
    const cwd = await makeTempDir();

    expect(isStrictlyInside(path.join(cwd, "a"), cwd)).toBe(true);
    expect(isStrictlyInside(cwd, cwd)).toBe(false);
    // A sibling whose name merely starts with the parent's name is not inside.
    expect(isStrictlyInside(`${cwd}-sibling`, cwd)).toBe(false);
    expect(isStrictlyInside(path.dirname(cwd), cwd)).toBe(false);
  });
});

describe("clearHandoffArtifacts", () => {
  it("removes handoff, archive, and session directories and reports them", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const paths = getHandoffPaths(cwd, config);
    await mkdir(path.dirname(paths.livePath), { recursive: true });
    await mkdir(paths.archiveDir, { recursive: true });
    await mkdir(path.join(cwd, ".keepitmovin", "sessions"), { recursive: true });
    await writeFile(paths.livePath, "# handoff", "utf8");
    await writeFile(path.join(paths.archiveDir, "old.md"), "# old", "utf8");
    await writeFile(path.join(cwd, ".keepitmovin", "sessions", "s.json"), "{}", "utf8");

    const removed = await clearHandoffArtifacts(cwd, config);

    expect(removed).toHaveLength(3);
    await expect(stat(paths.livePath)).rejects.toThrow();
    await expect(stat(paths.archiveDir)).rejects.toThrow();
  });

  it("reports nothing and throws nothing when there is nothing to clear", async () => {
    const cwd = await makeTempDir();

    await expect(clearHandoffArtifacts(cwd, defaultConfig())).resolves.toEqual([]);
  });

  it("never touches user files sitting next to .keepitmovin", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await mkdir(path.join(cwd, ".keepitmovin", "sessions"), { recursive: true });
    await writeFile(path.join(cwd, "src", "index.ts"), "export {};", "utf8");
    await writeFile(path.join(cwd, "README.md"), "docs", "utf8");
    await writeFile(path.join(cwd, ".keepitmovin", "sessions", "s.json"), "{}", "utf8");

    await clearHandoffArtifacts(cwd, config);

    await expect(readFile(path.join(cwd, "src", "index.ts"), "utf8")).resolves.toBe("export {};");
    await expect(readFile(path.join(cwd, "README.md"), "utf8")).resolves.toBe("docs");
  });
});
