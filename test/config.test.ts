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
      expect.arrayContaining([
        "claude",
        "codex",
        "cline",
        "antigravity",
        "opencode",
        "grok",
        "cursor",
        "aider",
        "goose",
        "amp",
        "droid",
        "copilot"
      ])
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

  it("appends newly default-enabled catalog providers to a legacy providerOrder", async () => {
    const cwd = await makeRealTempDir();
    const configPath = path.join(cwd, "codepass.config.json");
    const config = defaultConfig();
    config.harness.setupComplete = true;
    // Emulate a pre-1.5 config that predates Grok Build / Cursor Agent.
    config.harness.providers = config.harness.providers.filter(
      (provider) => provider.name !== "grok" && provider.name !== "cursor"
    );
    config.harness.providerOrder = ["claude", "codex", "antigravity", "opencode"];
    await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");

    const loaded = await loadConfig(cwd);

    // Re-added to the providers list as enabled by the catalog merge...
    const grok = loaded.config.harness.providers.find((provider) => provider.name === "grok");
    const cursor = loaded.config.harness.providers.find((provider) => provider.name === "cursor");
    expect(grok?.enabled).toBe(true);
    expect(cursor?.enabled).toBe(true);
    // ...and appended to providerOrder so they actually join the fallback chain
    // instead of showing as enabled-but-unreachable.
    expect(loaded.config.harness.providerOrder).toContain("grok");
    expect(loaded.config.harness.providerOrder).toContain("cursor");
    // The user's existing order is preserved; new tools land at the end.
    expect(loaded.config.harness.providerOrder.slice(0, 4)).toEqual([
      "claude",
      "codex",
      "antigravity",
      "opencode"
    ]);
  });

  it("does not append a provider the user deliberately dropped from the order", async () => {
    const cwd = await makeRealTempDir();
    const configPath = path.join(cwd, "codepass.config.json");
    const config = defaultConfig();
    config.harness.setupComplete = true;
    // grok stays configured but the user removed it from their chain.
    config.harness.providerOrder = ["claude", "codex"];
    await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");

    const loaded = await loadConfig(cwd);

    expect(loaded.config.harness.providerOrder).toEqual(["claude", "codex"]);
  });

  it("migrates old catalog bootstrap defaults to prompt arguments", async () => {
    const cwd = await makeRealTempDir();
    const configPath = path.join(cwd, "codepass.config.json");
    const config = defaultConfig();
    const claude = config.harness.providers.find((provider) => provider.name === "claude");

    if (!claude) {
      throw new Error("missing Claude provider");
    }

    claude.args = [];
    claude.handoffArgs = [];
    claude.integrationType = "pty_with_bootstrap_input";
    claude.bootstrapInput = "{{sessionPrompt}}\n";
    await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");

    const loaded = await loadConfig(cwd);
    const migratedClaude = loaded.config.harness.providers.find((provider) => provider.name === "claude");

    expect(migratedClaude).toMatchObject({
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"],
      integrationType: "pty"
    });
    expect(migratedClaude?.args).toEqual(["{{sessionPrompt}}"]);
    expect(migratedClaude?.bootstrapInput).toBeUndefined();
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

  it("defaults harness.handoffRefresh settings", () => {
    expect(defaultConfig().harness.handoffRefresh).toEqual({
      enabled: true,
      intervalMs: 60_000,
      nudge: {
        enabled: true,
        staleAfterMs: 300_000,
        idleForMs: 10_000,
        minTranscriptGrowthChars: 2_000
      }
    });
  });

  it("keeps task routing opt-in with local telemetry defaults", () => {
    expect(defaultConfig().routing).toEqual({
      enabled: false,
      promptForTask: true,
      allowOverride: true,
      askOutcome: true,
      telemetry: true
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
