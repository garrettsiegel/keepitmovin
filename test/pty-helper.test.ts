import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addExecutableBits } from "../src/pty-helper.js";

const makeTempFile = (mode: number): string => {
  const dir = path.join(os.tmpdir(), `codepass-pty-${Date.now()}-${Math.random()}`);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "spawn-helper");
  writeFileSync(file, "#!/bin/sh\n", "utf8");
  chmodSync(file, mode);
  return file;
};

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
    expect(addExecutableBits(path.join(os.tmpdir(), "codepass-does-not-exist-helper"))).toBe(false);
  });
});
