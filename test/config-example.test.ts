import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultConfig, keepitmovinConfigSchema } from "../src/config/index.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = path.join(repoRoot, "keepitmovin.config.example.json");

// The example file drifted from the schema once already: it was missing
// harness.watchdog and the claude/codex compactionProbe entries, so it no longer
// reflected what `kim init` writes. Pin it to defaultConfig() so drift fails CI
// instead of quietly misleading anyone who copies it.
describe("keepitmovin.config.example.json", () => {
  it("is valid against the config schema", async () => {
    const parsed = keepitmovinConfigSchema.safeParse(
      JSON.parse(await readFile(examplePath, "utf8"))
    );
    expect(parsed.success).toBe(true);
  });

  it("matches defaultConfig() exactly", async () => {
    const example = JSON.parse(await readFile(examplePath, "utf8")) as unknown;
    expect(example).toEqual(JSON.parse(JSON.stringify(defaultConfig())));
  });
});
