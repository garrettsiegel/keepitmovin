import { describe, expect, it } from "vitest";
import {
  catalogEntryToInteractiveProvider,
  getCatalogEntry,
  getDefaultInteractiveProviders,
  getDefaultProviderOrder,
  isHiddenCatalogEntry,
  isHiddenProviderName,
  mergeCatalogInteractiveProviders,
  reconcileProviderOrder
} from "../src/providers/catalog.js";
import { buildStackOptions, renderCatalogPreview } from "../src/setup/prompts.js";
import type { ToolStatus } from "../src/providers/tool-status.js";
import type { InteractiveProviderConfig } from "../src/config/types.js";

const HIDDEN_NAMES = ["cline", "aider", "goose", "amp", "droid", "openrouter"] as const;

const availableStatus = (name: string, label = name): ToolStatus => ({
  name,
  label,
  command: name,
  available: true,
  detail: `${name} 1.0.0`
});

describe("hidden provider support level", () => {
  it("marks the unverified tools hidden and keeps the supported set visible", () => {
    for (const name of HIDDEN_NAMES) {
      const entry = getCatalogEntry(name);
      expect(entry, name).toBeDefined();
      expect(isHiddenCatalogEntry(entry!), name).toBe(true);
    }

    for (const name of ["claude", "codex", "antigravity", "opencode", "grok", "cursor", "ollama", "copilot"]) {
      const entry = getCatalogEntry(name);
      expect(entry, name).toBeDefined();
      expect(isHiddenCatalogEntry(entry!), name).toBe(false);
    }

    expect(isHiddenProviderName("aider")).toBe(true);
    expect(isHiddenProviderName("claude")).toBe(false);
    // Unknown names are not treated as hidden — user-defined custom providers stay visible.
    expect(isHiddenProviderName("my-custom-tool")).toBe(false);
  });

  it("keeps hidden tools out of default providers and the default order", () => {
    const defaults = getDefaultInteractiveProviders().map((provider) => provider.name);

    for (const name of HIDDEN_NAMES) {
      expect(defaults).not.toContain(name);
    }

    expect(getDefaultProviderOrder()).toEqual([
      "claude",
      "codex",
      "kimi",
      "antigravity",
      "opencode",
      "grok",
      "cursor",
      "copilot",
      "ollama"
    ]);
  });

  it("still launches a hidden tool that an existing config references", () => {
    const configured: InteractiveProviderConfig[] = [
      {
        name: "aider",
        label: "Aider",
        enabled: true,
        command: "aider",
        args: [],
        handoffArgs: [],
        integrationType: "pty_with_bootstrap_input"
      }
    ];

    const merged = mergeCatalogInteractiveProviders(configured);
    const aider = merged.find((provider) => provider.name === "aider");

    // The entry survives, stays enabled, and is refreshed from the catalog.
    expect(aider).toMatchObject({
      name: "aider",
      enabled: true,
      command: "aider",
      integrationType: "pty_with_bootstrap_input"
    });
    expect(aider?.bootstrapInput).toBeDefined();
  });

  it("never appends hidden tools to a legacy providerOrder", () => {
    const configured: InteractiveProviderConfig[] = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const hiddenAsMerged = getCatalogEntry("aider")!;
    const merged = [
      ...mergeCatalogInteractiveProviders(configured),
      { ...catalogEntryToInteractiveProvider(hiddenAsMerged), enabled: true }
    ];

    const order = reconcileProviderOrder(configured, merged, ["claude"]);

    expect(order).not.toContain("aider");
  });

  it("hides hidden tools from the setup wizard unless already enabled", () => {
    const providers: InteractiveProviderConfig[] = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "claude",
        args: [],
        handoffArgs: [],
        integrationType: "pty"
      },
      {
        name: "aider",
        label: "Aider",
        enabled: false,
        command: "aider",
        args: [],
        handoffArgs: [],
        integrationType: "pty_with_bootstrap_input"
      },
      {
        name: "goose",
        label: "Goose",
        enabled: true,
        command: "goose",
        args: ["session"],
        handoffArgs: ["session"],
        integrationType: "pty_with_bootstrap_input"
      }
    ];
    const statuses = [availableStatus("claude"), availableStatus("aider"), availableStatus("goose")];

    const options = buildStackOptions(providers, statuses);
    const offered = Object.values(options).flat().map((option) => option.value);

    expect(offered).toContain("claude");
    // Disabled + hidden: stays out of the picker entirely.
    expect(offered).not.toContain("aider");
    // Enabled + hidden: an explicit earlier choice keeps working and stays visible.
    expect(offered).toContain("goose");
  });

  it("drops hidden guided tools from the catalog preview", () => {
    const statuses: ToolStatus[] = [
      {
        name: "openrouter",
        label: "OpenRouter",
        command: "setup guide",
        available: false,
        detail: "guided setup",
        group: "guided",
        controllable: false,
        summary: "Model-routing gateway."
      }
    ];

    expect(renderCatalogPreview(statuses)).toBe("No other tools to show right now.");
  });
});
