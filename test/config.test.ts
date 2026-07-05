import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { codepassConfigSchema, defaultConfig, initConfig, loadConfig } from "../src/config.js";

const makeRealTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-config-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

describe("config", () => {
  it("returns defaults when no config file exists", async () => {
    const cwd = await makeRealTempDir();
    const loaded = await loadConfig(cwd);

    expect(loaded.path).toBeUndefined();
    expect(loaded.config.harness.providers.map((provider) => provider.name)).toEqual(
      expect.arrayContaining(["claude", "codex", "cline", "antigravity", "opencode"])
    );
    expect(loaded.config.updates).toMatchObject({
      checkOnStart: true,
      mode: "prompt"
    });
  });

  it("loads a valid config file", async () => {
    const cwd = await makeRealTempDir();
    const configPath = path.join(cwd, "codepass.config.json");
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["codex", "claude"];
    await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");

    const loaded = await loadConfig(cwd);

    expect(loaded.path).toBe(configPath);
    expect(loaded.config.harness.setupComplete).toBe(true);
    expect(loaded.config.harness.providerOrder).toEqual(["codex", "claude"]);
  });

  it("migrates old catalog launch defaults to bootstrap input", async () => {
    const cwd = await makeRealTempDir();
    const configPath = path.join(cwd, "codepass.config.json");
    const config = defaultConfig();
    const claude = config.harness.providers.find((provider) => provider.name === "claude");

    if (!claude) {
      throw new Error("missing Claude provider");
    }

    claude.args = ["{{sessionPrompt}}"];
    claude.handoffArgs = ["{{handoffPrompt}}"];
    claude.integrationType = "pty";
    delete claude.bootstrapInput;
    await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");

    const loaded = await loadConfig(cwd);
    const migratedClaude = loaded.config.harness.providers.find((provider) => provider.name === "claude");

    expect(migratedClaude).toMatchObject({
      args: [],
      handoffArgs: [],
      integrationType: "pty_with_bootstrap_input",
      bootstrapInput: "{{sessionPrompt}}\n"
    });
  });

  it("rejects invalid harness provider entries", async () => {
    const cwd = await makeRealTempDir();
    await writeFile(
      path.join(cwd, "codepass.config.json"),
      JSON.stringify({
        harness: {
          providers: [
            {
              name: "broken",
              label: "Broken",
              command: "",
              args: [],
              handoffArgs: []
            }
          ]
        }
      }),
      "utf8"
    );

    await expect(loadConfig(cwd)).rejects.toThrow();
  });

  it("initializes config and codepass directories", async () => {
    const cwd = await makeRealTempDir();

    const result = await initConfig(cwd);

    expect(result.createdConfig).toBe(true);
    expect(JSON.parse(await readFile(result.configPath, "utf8"))).toMatchObject({
      harness: { providers: expect.any(Array) }
    });
    await expect(stat(path.join(cwd, ".codepass", "sessions"))).resolves.toMatchObject({
      isDirectory: expect.any(Function)
    });
    await expect(stat(path.join(cwd, ".codepass", "handoffs"))).resolves.toMatchObject({
      isDirectory: expect.any(Function)
    });
  });

  it("defaults harness.usageProbe settings", () => {
    expect(defaultConfig().harness.usageProbe).toEqual({
      enabled: true,
      thresholdPercent: 95,
      pollIntervalMs: 30_000
    });
  });

  it("accepts a per-provider usageProbe override and rejects unknown kinds", () => {
    const config = defaultConfig();
    const codex = config.harness.providers.find((provider) => provider.name === "codex");

    if (!codex) {
      throw new Error("missing Codex provider");
    }

    codex.usageProbe = { kind: "codex-session-files", thresholdPercent: 80 };
    const parsed = codepassConfigSchema.parse(config);
    const parsedCodex = parsed.harness.providers.find((provider) => provider.name === "codex");

    expect(parsedCodex?.usageProbe).toEqual({ kind: "codex-session-files", thresholdPercent: 80 });

    expect(() =>
      codepassConfigSchema.parse({
        harness: {
          providers: [
            {
              name: "codex",
              label: "Codex",
              command: "codex",
              args: [],
              handoffArgs: [],
              usageProbe: { kind: "nope" }
            }
          ]
        }
      })
    ).toThrow();
  });

  it("writes a .codepass/.gitignore marker on init and is idempotent", async () => {
    const cwd = await makeRealTempDir();
    const markerPath = path.join(cwd, ".codepass", ".gitignore");

    await initConfig(cwd);
    expect(await readFile(markerPath, "utf8")).toBe("*\n");

    // Re-running must not duplicate or change the marker.
    await initConfig(cwd);
    expect(await readFile(markerPath, "utf8")).toBe("*\n");
  });
});
