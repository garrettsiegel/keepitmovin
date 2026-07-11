import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { applyProviderOrder, applyRoutingPreference, getSetupState } from "../src/setup.js";

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-setup-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

describe("setup helpers", () => {
  it("marks selected providers enabled and setup complete", () => {
    const config = applyProviderOrder(defaultConfig(), ["codex", "claude"]);

    expect(config.harness.setupComplete).toBe(true);
    expect(config.harness.providerOrder).toEqual(["codex", "claude"]);
    expect(config.harness.providers.find((provider) => provider.name === "codex")?.enabled).toBe(true);
    expect(config.harness.providers.find((provider) => provider.name === "cline")?.enabled).toBe(false);
  });

  it("persists the routing opt-in without changing provider order", () => {
    const ordered = applyProviderOrder(defaultConfig(), ["codex", "claude"]);
    const config = applyRoutingPreference(ordered, true);

    expect(config.routing.enabled).toBe(true);
    expect(config.harness.providerOrder).toEqual(["codex", "claude"]);
  });

  it("detects setup state and provider commands from config", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.providers = [
      {
        name: "node",
        label: "Node",
        enabled: true,
        command: process.execPath,
        args: [],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    await writeFile(
      path.join(cwd, "codepass.config.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );

    const state = await getSetupState(cwd);

    expect(state.exists).toBe(true);
    expect(state.toolStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "node", available: true }),
        expect.objectContaining({ name: "antigravity", group: "harness" })
      ])
    );
    expect(state.catalogStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "antigravity", group: "harness" }),
        expect.objectContaining({ name: "ollama", group: "harness", controllable: true }),
        expect.objectContaining({ name: "openrouter", group: "guided", controllable: false })
      ])
    );
  }, 15_000);
});
