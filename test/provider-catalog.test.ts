import { describe, expect, it } from "vitest";
import {
  catalogEntryToInteractiveProvider,
  getCatalogEntry,
  getDefaultInteractiveProviders,
  getDefaultProviderOrder,
  getDefaultTaskProviders,
  getProviderCatalog,
  isHarnessControllable
} from "../src/provider-catalog.js";

describe("provider catalog", () => {
  it("contains popular terminal and guided integrations", () => {
    const names = getProviderCatalog().map((entry) => entry.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "claude",
        "codex",
        "cline",
        "antigravity",
        "gemini",
        "opencode",
        "github-copilot",
        "cursor",
        "devin",
        "openhands",
        "continue",
        "roo-code"
      ])
    );
  });

  it("marks Antigravity and opencode as controllable harness defaults", () => {
    const defaultProviders = getDefaultInteractiveProviders();
    const defaultOrder = getDefaultProviderOrder();

    expect(defaultProviders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "antigravity", integrationType: "pty_with_bootstrap_input", enabled: true }),
        expect.objectContaining({ name: "opencode", integrationType: "pty", enabled: true })
      ])
    );
    expect(defaultOrder).toEqual(expect.arrayContaining(["claude", "codex", "antigravity", "opencode"]));
  });

  it("keeps guided/cloud tools out of the auto-switch chain", () => {
    const devin = getCatalogEntry("devin");
    const cursor = getCatalogEntry("cursor");

    expect(devin?.controllable).toBe(false);
    expect(cursor?.controllable).toBe(false);
    expect(isHarnessControllable({
      integrationType: "cloud_link",
      controllable: false
    })).toBe(false);
  });

  it("renders catalog providers with prompt args and bootstrap inputs", () => {
    const claude = getCatalogEntry("claude");
    const codex = getCatalogEntry("codex");
    const antigravity = getCatalogEntry("antigravity");
    const aider = getCatalogEntry("aider");

    expect(claude && catalogEntryToInteractiveProvider(claude)).toMatchObject({
      name: "claude",
      args: [],
      handoffArgs: [],
      integrationType: "pty_with_bootstrap_input",
      bootstrapInput: "{{sessionPrompt}}\n"
    });
    expect(codex && catalogEntryToInteractiveProvider(codex)).toMatchObject({
      name: "codex",
      args: [],
      handoffArgs: [],
      integrationType: "pty_with_bootstrap_input",
      bootstrapInput: "{{sessionPrompt}}\n"
    });
    expect(antigravity && catalogEntryToInteractiveProvider(antigravity)).toMatchObject({
      name: "antigravity",
      integrationType: "pty_with_bootstrap_input",
      bootstrapInput: "{{sessionPrompt}}\n",
      handoffBootstrapInput: "{{handoffPrompt}}\n"
    });
    expect(aider && catalogEntryToInteractiveProvider(aider)).toMatchObject({
      name: "aider",
      integrationType: "pty_with_bootstrap_input",
      bootstrapInput: "{{sessionPrompt}}\n"
    });
  });

  it("exposes task-mode providers only for launchable terminal tools", () => {
    const taskProviders = getDefaultTaskProviders(1_000);

    expect(taskProviders.map((provider) => provider.name)).toEqual([
      "claude",
      "codex",
      "cline",
      "opencode"
    ]);
    expect(taskProviders.find((provider) => provider.name === "github-copilot")).toBeUndefined();
  });

  it("keeps legacy Gemini out of default harness providers", () => {
    const gemini = getCatalogEntry("gemini");

    expect(gemini).toMatchObject({
      group: "guided",
      controllable: false,
      deprecated: true,
      replacement: "antigravity"
    });
    expect(getDefaultInteractiveProviders().find((provider) => provider.name === "gemini")).toBeUndefined();
  });
});
