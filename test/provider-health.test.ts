import process from "node:process";
import { describe, expect, it } from "vitest";
import {
  catalogHealthInput,
  checkProviderCommand,
  interactiveHealthInput
} from "../src/providers/health.js";
import { getCatalogEntry } from "../src/providers/catalog.js";
import type { InteractiveProviderConfig } from "../src/config/types.js";

// Availability decides which tools `kim` will even try to launch, so a wrong
// answer here either drops a working tool from the chain or wastes a switch on
// a missing one. Previously exercised only indirectly through runDoctor.
describe("checkProviderCommand", () => {
  it("reports an installed command as available with its version output", async () => {
    const health = await checkProviderCommand({
      name: "node",
      label: "Node",
      enabled: true,
      command: process.execPath,
      versionArgs: ["--version"]
    });

    expect(health).toMatchObject({ name: "node", available: true, enabled: true });
    expect(health.detail).toContain("v");
  }, 15_000);

  it("reports a command that does not exist as not installed, without throwing", async () => {
    const health = await checkProviderCommand({
      name: "ghost",
      label: "Ghost",
      enabled: true,
      command: "keepitmovin-definitely-not-a-real-binary",
      versionArgs: ["--version"]
    });

    expect(health).toMatchObject({ available: false, detail: "not installed yet" });
  }, 15_000);

  it("treats a tool with no command as a setup-guide entry rather than a failure", async () => {
    const guided = await checkProviderCommand({
      name: "guided-tool",
      label: "Guided Tool",
      enabled: false,
      group: "guided",
      install: "See the docs"
    });

    expect(guided).toMatchObject({
      available: false,
      command: "setup guide",
      detail: "guided integration",
      install: "See the docs"
    });

    const unconfigured = await checkProviderCommand({
      name: "harness-tool",
      enabled: false,
      group: "harness"
    });
    expect(unconfigured.detail).toBe("command not configured");
  });

  it("carries install and auth guidance through so doctor can show it", async () => {
    const health = await checkProviderCommand({
      name: "ghost",
      enabled: true,
      command: "keepitmovin-definitely-not-a-real-binary",
      install: "npm i -g ghost",
      auth: "run ghost login",
      homepage: "https://example.invalid"
    });

    expect(health).toMatchObject({
      install: "npm i -g ghost",
      auth: "run ghost login",
      homepage: "https://example.invalid"
    });
  }, 15_000);
});

describe("health inputs", () => {
  it("builds a catalog input that marks whether the user has configured the tool", () => {
    const claude = getCatalogEntry("claude");
    if (!claude) {
      throw new Error("missing claude catalog entry");
    }

    expect(catalogHealthInput(claude, new Set(["claude"]))).toMatchObject({
      name: "claude",
      command: "claude",
      configured: true,
      enabled: claude.defaultEnabled
    });
    expect(catalogHealthInput(claude, new Set()).configured).toBe(false);
  });

  it("enriches a configured provider with catalog metadata it does not store itself", () => {
    const provider: InteractiveProviderConfig = {
      name: "claude",
      label: "Claude Code",
      enabled: true,
      command: "claude",
      args: [],
      handoffArgs: [],
      integrationType: "pty"
    };

    const input = interactiveHealthInput(provider);

    expect(input).toMatchObject({ name: "claude", configured: true, group: "harness" });
    // versionArgs/install live in the catalog, not in the user's config.
    expect(input.install).toBe(getCatalogEntry("claude")?.install);
  });

  it("still describes a provider the catalog no longer knows about", () => {
    const custom: InteractiveProviderConfig = {
      name: "my-own-tool",
      label: "My Own Tool",
      enabled: true,
      command: "my-own-tool",
      args: [],
      handoffArgs: [],
      integrationType: "pty"
    };

    // Removed catalog tools and hand-written entries land here; it must not throw.
    expect(interactiveHealthInput(custom)).toMatchObject({
      name: "my-own-tool",
      command: "my-own-tool",
      group: "harness",
      configured: true
    });
  });
});
