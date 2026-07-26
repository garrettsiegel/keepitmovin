import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { runDoctor } from "../src/doctor.js";
import { trustConfigFile } from "../src/config/trust.js";
import { makeTempDir } from "./support/tmp.js";


describe("runDoctor", () => {
  it("reports provider availability and default paths", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    // Non-catalog names survive normalization (catalog names get their command
    // overridden), so we can inject deterministic available/missing providers.
    config.harness.providers = [
      {
        name: "node-test",
        label: "Node",
        enabled: true,
        command: process.execPath,
        args: [],
        handoffArgs: [],
        integrationType: "pty"
      },
      {
        name: "missing-test",
        label: "Missing",
        enabled: true,
        command: "kim-command-that-should-not-exist",
        args: [],
        handoffArgs: [],
        integrationType: "pty"
      }
    ];
    const configPath = path.join(cwd, "keepitmovin.config.json");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    // These are custom (non-catalog) provider commands, so the trust gate would
    // refuse them non-interactively — pre-trust the config for this test.
    const home = await makeTempDir();
    process.env.KEEPITMOVIN_HOME = home;
    await trustConfigFile(configPath, home);

    const summary = await runDoctor(cwd);

    expect(summary.usingDefaultConfig).toBe(false);
    expect(summary.readyInteractiveProviderCount).toBeGreaterThanOrEqual(1);
    expect(summary.interactiveProviderHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "node-test", available: true }),
        expect.objectContaining({ name: "missing-test", available: false })
      ])
    );
    expect(summary.sessionsDir).toBe(path.join(cwd, ".keepitmovin", "sessions"));
  }, 15_000);

  it("reports the full popular provider catalog when requested", async () => {
    const cwd = await makeTempDir();

    const summary = await runDoctor(cwd, undefined, { includeAllCatalog: true });

    expect(summary.catalogProviderHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "antigravity", group: "harness", controllable: true }),
        expect.objectContaining({ name: "opencode", group: "harness", controllable: true }),
        expect.objectContaining({ name: "grok", group: "harness", controllable: true }),
        expect.objectContaining({ name: "cursor", group: "harness", controllable: true }),
        expect.objectContaining({ name: "copilot", group: "harness", controllable: true }),
        expect.objectContaining({ name: "ollama", group: "harness", controllable: true })
      ])
    );
  }, 15_000);
});
