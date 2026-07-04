import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, initConfig, loadConfig } from "../src/config.js";

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
    expect(loaded.config.providers.map((provider) => provider.name)).toEqual([
      "claude",
      "codex",
      "cline",
      "opencode"
    ]);
    expect(loaded.config.providers.find((provider) => provider.name === "cline")?.enabled).toBe(false);
    expect(loaded.config.harness.providers.map((provider) => provider.name)).toEqual(
      expect.arrayContaining(["claude", "codex", "cline", "antigravity", "opencode", "aider", "goose", "kiro", "amp"])
    );
    expect(loaded.config.updates).toMatchObject({
      checkOnStart: true,
      mode: "always"
    });
  });

  it("loads a valid config file", async () => {
    const cwd = await makeRealTempDir();
    const configPath = path.join(cwd, "codepass.config.json");
    const config = defaultConfig();
    config.providers = [
      {
        name: "fake",
        enabled: true,
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeoutMs: 1_000
      }
    ];
    await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");

    const loaded = await loadConfig(cwd);

    expect(loaded.path).toBe(configPath);
    expect(loaded.config.providers[0]?.name).toBe("fake");
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

  it("rejects invalid provider entries", async () => {
    const cwd = await makeRealTempDir();
    await writeFile(
      path.join(cwd, "codepass.config.json"),
      JSON.stringify({
        providers: [
          {
            name: "broken",
            enabled: true,
            command: "",
            args: [],
            timeoutMs: 1_000
          }
        ]
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
      providers: expect.any(Array)
    });
    await expect(stat(path.join(cwd, ".codepass", "runs"))).resolves.toMatchObject({
      isDirectory: expect.any(Function)
    });
    await expect(stat(path.join(cwd, ".codepass", "logs"))).resolves.toMatchObject({
      isDirectory: expect.any(Function)
    });
  });
});
