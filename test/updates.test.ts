import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { ensureProviderFreshness, type UpdateCommandRunner } from "../src/setup/updates.js";

describe("ensureProviderFreshness", () => {
  it("runs verified native updater commands in always mode", async () => {
    const config = defaultConfig();
    config.updates.checkOnStart = true;
    config.updates.mode = "always";
    const provider = {
      name: "claude",
      label: "Claude Code",
      enabled: true,
      command: "fake-claude",
      args: [],
      handoffArgs: [],
      integrationType: "pty" as const
    };
    config.harness.providers = [provider];
    config.harness.providerOrder = ["claude"];
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: UpdateCommandRunner = async (command, args) => {
      calls.push({ command, args });

      return {
        exitCode: 0,
        stdout: command === "fake-claude" ? "2.1.199" : "updated",
        stderr: ""
      };
    };

    const results = await ensureProviderFreshness({
      cwd: "/tmp/project",
      config,
      interactive: false,
      runner
    });

    expect(calls).toEqual([
      { command: "fake-claude", args: ["--version"] },
      { command: "claude", args: ["update"] }
    ]);
    expect(results).toEqual([
      expect.objectContaining({ provider: "claude", action: "updated" })
    ]);
  });

  it("skips update commands in prompt mode when non-interactive", async () => {
    const config = defaultConfig();
    config.updates.checkOnStart = true;
    expect(config.updates.mode).toBe("prompt");
    const provider = {
      name: "claude",
      label: "Claude Code",
      enabled: true,
      command: "fake-claude",
      args: [],
      handoffArgs: [],
      integrationType: "pty" as const
    };
    config.harness.providers = [provider];
    config.harness.providerOrder = ["claude"];
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: UpdateCommandRunner = async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 0, stdout: "2.1.199", stderr: "" };
    };

    const results = await ensureProviderFreshness({
      cwd: "/tmp/project",
      config,
      interactive: false,
      runner
    });

    // Only the version probe runs; the `claude update` command is never invoked.
    expect(calls).toEqual([{ command: "fake-claude", args: ["--version"] }]);
    expect(results).toEqual([
      expect.objectContaining({ provider: "claude", action: "skipped" })
    ]);
  });

  it("reports missing tools without guessing an installer", async () => {
    const config = defaultConfig();
    config.updates.checkOnStart = true;
    config.harness.providerOrder = ["antigravity"];
    config.harness.providers = [
      {
        name: "antigravity",
        label: "Google Antigravity",
        enabled: true,
        command: "antigravity",
        args: [],
        handoffArgs: [],
        integrationType: "pty_with_bootstrap_input",
        bootstrapInput: "{{sessionPrompt}}\n",
        handoffBootstrapInput: "{{handoffPrompt}}\n"
      }
    ];
    const runner: UpdateCommandRunner = async () => ({
      exitCode: 127,
      stdout: "",
      stderr: "command not found"
    });

    const results = await ensureProviderFreshness({
      cwd: "/tmp/project",
      config,
      interactive: false,
      runner
    });

    expect(results).toEqual([
      expect.objectContaining({
        provider: "antigravity",
        action: "missing",
        detail: expect.stringContaining("https://antigravity.google/")
      })
    ]);
  });
});
