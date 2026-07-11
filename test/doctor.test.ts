import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
import { trustConfigFile } from "../src/trust.js";

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-doctor-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

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
        command: "codepass-command-that-should-not-exist",
        args: [],
        handoffArgs: [],
        integrationType: "pty"
      }
    ];
    const configPath = path.join(cwd, "codepass.config.json");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    // These are custom (non-catalog) provider commands, so the trust gate would
    // refuse them non-interactively — pre-trust the config for this test.
    const home = await makeTempDir();
    process.env.CODEPASS_HOME = home;
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
    expect(summary.sessionsDir).toBe(path.join(cwd, ".codepass", "sessions"));
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
        expect.objectContaining({ name: "aider", group: "harness", controllable: true }),
        expect.objectContaining({ name: "goose", group: "harness", controllable: true }),
        expect.objectContaining({ name: "amp", group: "harness", controllable: true }),
        expect.objectContaining({ name: "droid", group: "harness", controllable: true }),
        expect.objectContaining({ name: "copilot", group: "harness", controllable: true }),
        expect.objectContaining({ name: "ollama", group: "harness", controllable: true }),
        expect.objectContaining({ name: "openrouter", group: "guided", integrationType: "external_app" })
      ])
    );
  }, 15_000);
});
