import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSafeToRecursivelyDelete, isStrictlyInside, resolveFromCwd } from "../src/util/paths.js";

// isSafeToRecursivelyDelete is the only thing standing between a mis-set
// handoffPath and `rm(dir, { recursive: true, force: true })` in
// handoff-artifacts.ts, and it had no tests at all.
const cwd = path.join(os.tmpdir(), "kim-paths-fixture", "project");

describe("resolveFromCwd", () => {
  it("resolves a relative path against cwd", () => {
    expect(resolveFromCwd(cwd, ".keepitmovin/current")).toBe(
      path.join(cwd, ".keepitmovin/current")
    );
  });

  it("leaves an absolute path untouched", () => {
    const absolute = path.join(os.tmpdir(), "elsewhere");
    expect(resolveFromCwd(cwd, absolute)).toBe(absolute);
  });
});

describe("isStrictlyInside", () => {
  it("is true for a proper descendant", () => {
    expect(isStrictlyInside(path.join(cwd, "a", "b"), cwd)).toBe(true);
  });

  it("is false for the directory itself", () => {
    expect(isStrictlyInside(cwd, cwd)).toBe(false);
  });

  it("is false for an ancestor", () => {
    expect(isStrictlyInside(path.dirname(cwd), cwd)).toBe(false);
  });

  it("is false for a sibling that shares a name prefix", () => {
    expect(isStrictlyInside(`${cwd}-other`, cwd)).toBe(false);
  });

  it("is false when traversal escapes the parent", () => {
    expect(isStrictlyInside(path.join(cwd, "..", "..", "etc"), cwd)).toBe(false);
  });
});

describe("isSafeToRecursivelyDelete", () => {
  it("allows a .keepitmovin directory inside the project", () => {
    expect(isSafeToRecursivelyDelete(path.join(cwd, ".keepitmovin", "handoffs"), cwd)).toBe(true);
  });

  it("refuses the working directory itself", () => {
    expect(isSafeToRecursivelyDelete(cwd, cwd)).toBe(false);
  });

  it("refuses an ancestor of the working directory", () => {
    expect(isSafeToRecursivelyDelete(path.dirname(cwd), cwd)).toBe(false);
  });

  it("refuses the home directory", () => {
    expect(isSafeToRecursivelyDelete(os.homedir(), cwd)).toBe(false);
  });

  it("refuses the filesystem root", () => {
    expect(isSafeToRecursivelyDelete(path.parse(cwd).root, cwd)).toBe(false);
  });

  it("refuses the git root", () => {
    const gitRoot = path.dirname(cwd);
    expect(isSafeToRecursivelyDelete(gitRoot, cwd, { gitRoot })).toBe(false);
  });

  it("refuses a project directory with no .keepitmovin segment", () => {
    // The reported hazard: handoffPath "handoff.md" makes dirname === cwd, and a
    // path like <cwd>/src must never be recursively removed.
    expect(isSafeToRecursivelyDelete(path.join(cwd, "src"), cwd)).toBe(false);
  });

  it("refuses a .keepitmovin directory outside the project by default", () => {
    const outside = path.join(os.tmpdir(), "somewhere-else", ".keepitmovin");
    expect(isSafeToRecursivelyDelete(outside, cwd)).toBe(false);
  });

  it("allows an explicitly configured absolute artifacts dir", () => {
    const outside = path.join(os.tmpdir(), "somewhere-else", ".keepitmovin");
    expect(
      isSafeToRecursivelyDelete(outside, cwd, { allowedAbsoluteDirs: [outside] })
    ).toBe(true);
  });

  it("does not allow a child of an allowed absolute dir it was not given", () => {
    const allowed = path.join(os.tmpdir(), "somewhere-else", ".keepitmovin");
    const sibling = path.join(os.tmpdir(), "somewhere-else", "other");
    expect(isSafeToRecursivelyDelete(sibling, cwd, { allowedAbsoluteDirs: [allowed] })).toBe(
      false
    );
  });
});
