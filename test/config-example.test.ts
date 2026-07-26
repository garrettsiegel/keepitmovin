import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultConfig, keepitmovinConfigSchema } from "../src/config/index.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = path.join(repoRoot, "keepitmovin.config.example.json");

// The example used to restate every default, which meant copying it froze that
// day's defaults into your repo forever. It is now a short overrides-only file,
// so what this test guards is that it stays short and stays valid.
describe("keepitmovin.config.example.json", () => {
  it("is valid against the config schema", async () => {
    const parsed = keepitmovinConfigSchema.safeParse(
      JSON.parse(await readFile(examplePath, "utf8"))
    );
    expect(parsed.success).toBe(true);
  });

  it("stays a short overrides-only example", async () => {
    const raw = await readFile(examplePath, "utf8");
    expect(raw.split("\n").length).toBeLessThanOrEqual(20);
    // Providers come from the catalog on load; spelling them out here is what
    // made the old example 266 lines and immediately stale.
    expect(JSON.parse(raw).harness?.providers).toBeUndefined();
  });

  it("parses into something the app can run with", async () => {
    const parsed = keepitmovinConfigSchema.parse(JSON.parse(await readFile(examplePath, "utf8")));
    // Absent keys fall back to the same defaults the app ships with.
    expect(parsed.harness.usageProbe).toEqual(defaultConfig().harness.usageProbe);
    expect(parsed.harness.providerOrder).toEqual(["claude", "codex", "opencode"]);
  });
});
