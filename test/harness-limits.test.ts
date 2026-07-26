import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runHarness, type PtyFactory } from "../src/harness.js";
import { makeTempDir } from "./support/tmp.js";
import { FakePty } from "./support/fake-pty.js";

describe("runHarness — limit detection", () => {
  it("does not switch when a provider merely mentions a limit in prose", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const launches: string[] = [];
    const ptyFactory: PtyFactory = (command) => {
      launches.push(command);
      return new FakePty({
        data: "Checked the API rate limit of 100 req/min and 429 handling — everything is fine.",
        exitCode: 0
      });
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]?.errorType).toBeUndefined();
    expect(summary.finalProvider).toBe("claude");
    expect(summary.success).toBe(true);
    expect(launches).toEqual(["fake-claude"]);
  });

  it("does not switch on Claude Code's wrapped percentage usage warning", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const launches: string[] = [];
    const ptyFactory: PtyFactory = (command) => {
      launches.push(command);
      // The ink TUI wraps the notice across rows, so "session limit …" heads its
      // own line — the exact shape that used to force a spurious handoff.
      return new FakePty({
        data: "You've used 92% of your\nsession limit · resets 1am (America/New_York) · /upgrade to keep using Claude Code",
        exitCode: 0
      });
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]?.errorType).toBeUndefined();
    expect(summary.finalProvider).toBe("claude");
    expect(summary.success).toBe(true);
    expect(launches).toEqual(["fake-claude"]);
  });

  it("still switches when a real limit appears on an error line", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const ptyFactory: PtyFactory = (command) =>
      command === "fake-claude"
        ? new FakePty({
            data: "Error: 429 Too Many Requests",
            exitCode: 1,
            waitForKill: true
          })
        : new FakePty({ data: "continued", exitCode: 0 });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
  });

  it("detects a rate limit prefixed by a unicode warning symbol", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const ptyFactory: PtyFactory = (command) =>
      command === "fake-claude"
        ? new FakePty({
            data: "\u26A0\uFE0F Rate limit exceeded",
            exitCode: 1,
            waitForKill: true
          })
        : new FakePty({ data: "continued", exitCode: 0 });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
  });

  it("detects a rate limit behind a bracketed log prefix", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const ptyFactory: PtyFactory = (command) =>
      command === "fake-claude"
        ? new FakePty({
            data: "[16:02:34] Error: rate limit reached",
            exitCode: 1,
            waitForKill: true
          })
        : new FakePty({ data: "continued", exitCode: 0 });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
  });

  it("detects Claude Code's actual usage-limit-reached message", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const ptyFactory: PtyFactory = (command) =>
      command === "fake-claude"
        ? new FakePty({
            data: "Claude usage limit reached. Your limit will reset at 8:00 PM.\n\nWhat would you like to do?\n\n1. Wait until the limit resets\n2. Upgrade to increase your usage limit",
            exitCode: 1,
            waitForKill: true
          })
        : new FakePty({ data: "continued", exitCode: 0 });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
  });

  it("detects a rate limit from the full transcript when the tool exits cleanly after showing a limit", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const pad = "\n".repeat(5000);
    const ptyFactory: PtyFactory = (command) =>
      command === "fake-claude"
        ? new FakePty({
            data: `You've hit your session limit${pad}`,
            exitCode: 0
          })
        : new FakePty({ data: "continued", exitCode: 0 });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
  });

  it("switches on a provider-specific limit banner the generic patterns would miss", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty",
        // Exact banner with no generic pattern ("rate limit"/"usage limit"/…) and
        // no status word ("reached"/"hit"/…), so only the provider path can catch it.
        limitPatterns: ["you are out of credits"]
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const ptyFactory: PtyFactory = (command) =>
      command === "fake-claude"
        ? new FakePty({
            data: "You are out of credits until tomorrow.",
            exitCode: 1,
            waitForKill: true
          })
        : new FakePty({ data: "continued", exitCode: 0 });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
  });

  it("keeps the prose guard intact even when the provider has limitPatterns", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty",
        limitPatterns: ["you are out of credits"]
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const launches: string[] = [];
    const ptyFactory: PtyFactory = (command) => {
      launches.push(command);
      // Generic limit words appear only in prose, and the exact banner never does.
      return new FakePty({
        data: "Checked the API rate limit of 100 req/min and 429 handling — everything is fine.",
        exitCode: 0
      });
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]?.errorType).toBeUndefined();
    expect(summary.finalProvider).toBe("claude");
    expect(launches).toEqual(["fake-claude"]);
  });

  it("ignores a provider limit banner when rate_limit is not a fallback trigger", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude", "codex"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty",
        limitPatterns: ["you are out of credits"],
        // This provider opts out of rate-limit switching entirely.
        fallbackOn: ["timeout"]
      },
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];
    const launches: string[] = [];
    const ptyFactory: PtyFactory = (command) => {
      launches.push(command);
      return new FakePty({
        data: "You are out of credits until tomorrow.",
        exitCode: 0
      });
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]?.errorType).toBeUndefined();
    expect(launches).toEqual(["fake-claude"]);
  });

});
