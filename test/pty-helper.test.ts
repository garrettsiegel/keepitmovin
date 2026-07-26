import { chmodSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addExecutableBits } from "../src/pty/helper.js";

// This helper is synchronous (it exercises the sync exec-bit path), so it can't
// use the shared async makeTempDir — it cleans up its own directories instead.
const tempDirs: string[] = [];

const makeTempFile = (mode: number): string => {
  const dir = path.join(os.tmpdir(), `kim-pty-${process.pid}-${tempDirs.length}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  const file = path.join(dir, "spawn-helper");
  writeFileSync(file, "#!/bin/sh\n", "utf8");
  chmodSync(file, mode);
  return file;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("addExecutableBits", () => {
  it("adds execute bits to a non-executable file", () => {
    const file = makeTempFile(0o644);

    expect(addExecutableBits(file)).toBe(true);
    expect(statSync(file).mode & 0o111).toBe(0o111);
  });

  it("is a no-op when the file is already executable", () => {
    const file = makeTempFile(0o755);

    expect(addExecutableBits(file)).toBe(false);
    expect(statSync(file).mode & 0o111).toBe(0o111);
  });

  it("returns false for a missing file", () => {
    expect(addExecutableBits(path.join(os.tmpdir(), "kim-does-not-exist-helper"))).toBe(false);
  });
});
