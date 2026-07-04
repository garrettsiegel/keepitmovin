import { describe, expect, it } from "vitest";
import {
  catalogEntryToInteractiveProvider,
  getCatalogEntry,
  getDefaultInteractiveProviders,
  getDefaultProviderOrder,
  getProviderCatalog,
  isHarnessControllable
} from "../src/provider-catalog.js";

describe("provider catalog", () => {
  it("contains the V1 provider set: terminal harness tools plus guided OpenRouter", () => {
    const names = getProviderCatalog().map((entry) => entry.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "claude",
        "codex",
        "cline",
        "antigravity",
        "opencode",
        "ollama",
        "openrouter"
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

  it("keeps guided tools out of the auto-switch chain", () => {
    const openrouter = getCatalogEntry("openrouter");

    expect(openrouter?.group).toBe("guided");
    expect(openrouter?.controllable).toBe(false);
    expect(getDefaultInteractiveProviders().find((provider) => provider.name === "openrouter")).toBeUndefined();
    expect(isHarnessControllable({
      integrationType: "external_app",
      controllable: false
    })).toBe(false);
  });

  it("adds ollama as a disabled-by-default local harness provider", () => {
    const ollama = getCatalogEntry("ollama");

    expect(ollama).toMatchObject({
      group: "harness",
      controllable: true,
      defaultEnabled: false,
      integrationType: "pty_with_bootstrap_input"
    });
    expect(getDefaultInteractiveProviders().find((provider) => provider.name === "ollama")).toMatchObject({
      enabled: false
    });
  });

  it("renders catalog providers with prompt args and bootstrap inputs", () => {
    const claude = getCatalogEntry("claude");
    const codex = getCatalogEntry("codex");
    const antigravity = getCatalogEntry("antigravity");

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
  });

  it("carries provider-specific limit banners onto the launchable provider", () => {
    const claude = getCatalogEntry("claude");
    const provider = claude && catalogEntryToInteractiveProvider(claude);

    expect(provider?.limitPatterns).toEqual(expect.arrayContaining(["5-hour limit reached"]));
  });

});
