import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

// Every suite rolled its own os.tmpdir()/kim-*-${Date.now()}-${Math.random()}
// helper and none of them cleaned up, so a full run left dozens of directories
// behind. Registering the cleanup here keeps that in one place.
const created: string[] = [];

let counter = 0;

/** Creates a temp directory that is removed after the current test. */
export const makeTempDir = async (prefix = "kim"): Promise<string> => {
  counter += 1;
  const dir = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${counter}`);
  await mkdir(dir, { recursive: true });
  created.push(dir);
  return dir;
};

afterEach(async () => {
  const dirs = created.splice(0);
  await Promise.all(
    dirs.map(async (dir) => {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // A leftover temp dir is not worth failing a test over.
      }
    })
  );
});
