import { describe, expect, it } from "vitest";
import {
  catalogEntryToInteractiveProvider,
  getCatalogEntry,
  getDefaultInteractiveProviders,
  getDefaultProviderOrder,
  getProviderCatalog,
  isHarnessControllable,
  mergeCatalogInteractiveProviders
} from "../src/providers/catalog.js";
import type { InteractiveProviderConfig } from "../src/config/types.js";

describe("provider catalog", () => {
  it("contains the V1 provider set: terminal harness tools plus guided OpenRouter", () => {
    const names = getProviderCatalog().map((entry) => entry.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "claude",
        "codex",
        "kimi",
        "cline",
        "antigravity",
        "opencode",
        "grok",
        "cursor",
        "ollama",
        "openrouter",
        "aider",
        "goose",
        "amp",
        "droid",
        "copilot"
      ])
    );
  });

  it("marks Antigravity, opencode, Grok Build, and Cursor Agent as controllable harness defaults", () => {
    const defaultProviders = getDefaultInteractiveProviders();
    const defaultOrder = getDefaultProviderOrder();

    expect(defaultProviders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "antigravity", integrationType: "pty", enabled: true }),
        expect.objectContaining({ name: "opencode", integrationType: "pty", enabled: true }),
        expect.objectContaining({
          name: "grok",
          label: "Grok Build",
          command: "grok",
          integrationType: "pty",
          enabled: true,
          args: ["{{sessionPrompt}}"],
          handoffArgs: ["{{handoffPrompt}}"]
        }),
        expect.objectContaining({
          name: "cursor",
          label: "Cursor Agent",
          command: "agent",
          integrationType: "pty",
          enabled: true,
          args: ["{{sessionPrompt}}"],
          handoffArgs: ["{{handoffPrompt}}"]
        })
      ])
    );
    // Exact default chain order (catalog position drives new-install order).
    // The nine fully-supported tools, Ollama last as the local fallback. Hidden
    // tools (Cline, Aider, Goose, Amp, Droid, OpenRouter) are excluded.
    expect(defaultOrder).toEqual([
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

  it("launches Cline in interactive TUI mode with -i", () => {
    const cline = getCatalogEntry("cline");
    expect(cline && catalogEntryToInteractiveProvider(cline)).toMatchObject({
      name: "cline",
      command: "cline",
      args: ["-i", "{{sessionPrompt}}"],
      handoffArgs: ["-i", "{{handoffPrompt}}"],
      integrationType: "pty",
      enabled: false
    });
  });

  it("keeps Aider, Goose, Amp, and Factory Droid as opt-in harness catalog entries", () => {
    for (const name of ["aider", "goose", "amp", "droid"] as const) {
      const entry = getCatalogEntry(name);
      expect(entry).toMatchObject({
        group: "harness",
        controllable: true,
        defaultEnabled: false
      });
    }

    expect(getCatalogEntry("aider")).toMatchObject({
      command: "aider",
      integrationType: "pty_with_bootstrap_input",
      args: [],
      handoffArgs: []
    });
    expect(getCatalogEntry("goose")).toMatchObject({
      command: "goose",
      integrationType: "pty_with_bootstrap_input",
      args: ["session"],
      handoffArgs: ["session"]
    });
    expect(getCatalogEntry("amp")).toMatchObject({
      command: "amp",
      integrationType: "pty_with_bootstrap_input",
      args: [],
      handoffArgs: []
    });
    expect(getCatalogEntry("droid") && catalogEntryToInteractiveProvider(getCatalogEntry("droid")!)).toMatchObject({
      name: "droid",
      label: "Factory Droid",
      command: "droid",
      integrationType: "pty",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"]
    });
  });

  it("adds Kimi CLI and GitHub Copilot CLI as fully-supported default tools", () => {
    for (const name of ["kimi", "copilot"] as const) {
      expect(getCatalogEntry(name)).toMatchObject({
        group: "harness",
        controllable: true,
        defaultEnabled: true,
        integrationType: "pty_with_bootstrap_input"
      });
    }

    const kimi = getCatalogEntry("kimi");
    // Kimi's -p is one-shot, so it launches interactively and pastes the handoff.
    expect(kimi).toMatchObject({ command: "kimi", args: [], handoffArgs: [] });
    expect(kimi?.limitPatterns).toEqual(expect.arrayContaining(["[provider.rate_limit]"]));
    expect(getCatalogEntry("copilot")).toMatchObject({
      command: "copilot",
      integrationType: "pty_with_bootstrap_input",
      args: [],
      handoffArgs: []
    });
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

  it("adds ollama as the default-enabled local last-resort harness provider", () => {
    const ollama = getCatalogEntry("ollama");

    expect(ollama).toMatchObject({
      group: "harness",
      controllable: true,
      defaultEnabled: true,
      integrationType: "pty_with_bootstrap_input"
    });
    // Ollama is the final entry in the default fallback chain.
    expect(getDefaultProviderOrder().at(-1)).toBe("ollama");
    expect(getDefaultInteractiveProviders().find((provider) => provider.name === "ollama")).toMatchObject({
      enabled: true
    });
  });

  it("pastes the task/handoff text inline for Ollama (a REPL with no file access)", () => {
    const ollama = getCatalogEntry("ollama");

    // Ollama cannot open the handoff file, so its bootstrap must inline the prompt
    // rather than point at {{handoffPath}} like the file-capable agents do.
    expect(ollama?.bootstrapInput).toBe("{{sessionPrompt}}\n");
    expect(ollama?.handoffBootstrapInput).toBe("{{handoffPrompt}}\n");
    expect(ollama?.bootstrapInput).not.toContain("{{handoffPath}}");
  });

  it("renders catalog providers with startup-safe prompt arguments", () => {
    const claude = getCatalogEntry("claude");
    const codex = getCatalogEntry("codex");
    const antigravity = getCatalogEntry("antigravity");
    const grok = getCatalogEntry("grok");
    const cursor = getCatalogEntry("cursor");

    expect(claude && catalogEntryToInteractiveProvider(claude)).toMatchObject({
      name: "claude",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"],
      integrationType: "pty",
      bootstrapInput: undefined
    });
    expect(codex && catalogEntryToInteractiveProvider(codex)).toMatchObject({
      name: "codex",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"],
      integrationType: "pty",
      bootstrapInput: undefined
    });
    expect(antigravity && catalogEntryToInteractiveProvider(antigravity)).toMatchObject({
      name: "antigravity",
      args: ["--prompt-interactive", "{{sessionPrompt}}"],
      handoffArgs: ["--prompt-interactive", "{{handoffPrompt}}"],
      integrationType: "pty",
      bootstrapInput: undefined
    });
    expect(grok && catalogEntryToInteractiveProvider(grok)).toMatchObject({
      name: "grok",
      label: "Grok Build",
      command: "grok",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"],
      integrationType: "pty",
      controllable: true,
      bootstrapInput: undefined
    });
    expect(grok?.limitPatterns).toEqual(expect.arrayContaining(["you hit your weekly limit"]));
    expect(grok?.defaultEnabled).toBe(true);
    expect(grok?.updateCommands).toEqual([
      { label: "Update Grok Build", command: "grok", args: ["update"] }
    ]);
    expect(cursor && catalogEntryToInteractiveProvider(cursor)).toMatchObject({
      name: "cursor",
      label: "Cursor Agent",
      command: "agent",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"],
      integrationType: "pty",
      controllable: true,
      bootstrapInput: undefined
    });
    expect(cursor?.limitPatterns).toEqual(expect.arrayContaining(["you've hit your usage limit"]));
    expect(cursor?.defaultEnabled).toBe(true);
    expect(cursor?.updateCommands).toEqual([
      { label: "Update Cursor Agent", command: "agent", args: ["update"] }
    ]);
  });

  it("appends new catalog providers to legacy configs that predate those entries", () => {
    const legacy: InteractiveProviderConfig[] = [
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

    const merged = mergeCatalogInteractiveProviders(legacy);
    const grok = merged.find((provider) => provider.name === "grok");
    const cursor = merged.find((provider) => provider.name === "cursor");

    expect(grok).toMatchObject({
      name: "grok",
      label: "Grok Build",
      command: "grok",
      enabled: true,
      integrationType: "pty",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"]
    });
    expect(cursor).toMatchObject({
      name: "cursor",
      label: "Cursor Agent",
      command: "agent",
      enabled: true,
      integrationType: "pty",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"]
    });
    // Merge only extends providers; caller-owned providerOrder is unchanged.
    // Hidden catalog tools (Aider, Goose, Amp, Droid) are never appended.
    const mergedNames = merged.map((provider) => provider.name);
    expect(mergedNames).toEqual(expect.arrayContaining(["claude", "grok", "cursor", "copilot"]));
    for (const hidden of ["aider", "goose", "amp", "droid"]) {
      expect(mergedNames).not.toContain(hidden);
    }
  });

  it("carries provider-specific limit banners onto the launchable provider", () => {
    const claude = getCatalogEntry("claude");
    const provider = claude && catalogEntryToInteractiveProvider(claude);

    expect(provider?.limitPatterns).toEqual(expect.arrayContaining(["5-hour limit reached"]));
  });

  it("gives codex a session-file usage probe and leaves claude without one", () => {
    expect(getCatalogEntry("codex")?.usageProbe).toEqual({ kind: "codex-session-files" });
    expect(getCatalogEntry("claude")?.usageProbe).toBeUndefined();
  });

  it("threads usageProbe onto pre-existing configs via the catalog merge", () => {
    const legacyCodex: InteractiveProviderConfig = {
      name: "codex",
      label: "Codex",
      enabled: true,
      command: "codex",
      args: [],
      handoffArgs: [],
      integrationType: "pty_with_bootstrap_input"
    };

    const merged = mergeCatalogInteractiveProviders([legacyCodex]);

    expect(merged.find((provider) => provider.name === "codex")?.usageProbe).toEqual({
      kind: "codex-session-files"
    });
  });

});
