import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { applyProviderOrder, getSetupState } from "../src/setup/index.js";
import { defaultProviderOrder } from "../src/setup/prompts.js";
import { makeTempDir } from "./support/tmp.js";


describe("setup helpers", () => {
  it("marks selected providers enabled and setup complete", () => {
    const config = applyProviderOrder(defaultConfig(), ["codex", "claude"]);

    expect(config.harness.setupComplete).toBe(true);
    expect(config.harness.providerOrder).toEqual(["codex", "claude"]);
    expect(config.harness.providers.find((provider) => provider.name === "codex")?.enabled).toBe(true);
    // A supported provider left out of the chosen order is disabled.
    expect(config.harness.providers.find((provider) => provider.name === "kimi")?.enabled).toBe(false);
  });

  it("suggests an order without prompting: saved order first, then catalog order", () => {
    const providers = defaultConfig().harness.providers;

    // A tool the user already ordered keeps its place; a newly picked one is
    // appended in catalog order rather than triggering a per-slot question.
    expect(defaultProviderOrder(["kimi", "codex", "claude"], providers, ["codex", "claude"]))
      .toEqual(["codex", "claude", "kimi"]);
  });

  it("falls back to catalog order when nothing was saved", () => {
    const providers = defaultConfig().harness.providers;
    const catalogOrder = providers.map((provider) => provider.name);
    const picked = ["opencode", "claude", "codex"];

    expect(defaultProviderOrder(picked, providers, [])).toEqual(
      [...picked].sort((left, right) => catalogOrder.indexOf(left) - catalogOrder.indexOf(right))
    );
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
      path.join(cwd, "keepitmovin.config.json"),
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
