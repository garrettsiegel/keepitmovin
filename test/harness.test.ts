import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runHarness, type PtyFactory, type PtyProcess } from "../src/harness.js";

class FakePty implements PtyProcess {
  #dataListeners: Array<(data: string) => void> = [];
  #exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  #exited = false;
  writes: string[] = [];

  constructor(
    private readonly script: { data: string; exitCode: number; waitForKill?: boolean }
  ) {
    queueMicrotask(() => {
      this.#dataListeners.forEach((listener) => listener(this.script.data));
      if (!this.script.waitForKill) {
        this.exit(this.script.exitCode);
      }
    });
  }

  onData(listener: (data: string) => void): void {
    this.#dataListeners.push(listener);
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.#exitListeners.push(listener);
  }

  write(data: string): void {
    this.writes.push(data);
  }

  kill(): void {
    this.exit(this.script.exitCode);
  }

  resize(): void {}

  private exit(exitCode: number): void {
    if (this.#exited) {
      return;
    }

    this.#exited = true;
    this.#exitListeners.forEach((listener) => listener({ exitCode }));
  }
}

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-harness-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

// Codex usage-probe fixture helpers (mirror of test/usage-probe.test.ts).
const dayDir = (baseDir: string, date: Date): string =>
  path.join(
    baseDir,
    "sessions",
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  );

const writeRollout = async (
  baseDir: string,
  date: Date,
  fileName: string,
  lines: string[]
): Promise<void> => {
  await mkdir(dayDir(baseDir, date), { recursive: true });
  await writeFile(path.join(dayDir(baseDir, date), fileName), `${lines.join("\n")}\n`, "utf8");
};

const rateLimitLine = (primary: number, secondary: number): string =>
  JSON.stringify({
    timestamp: "2025-09-27T07:27:21.415Z",
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        primary: { used_percent: primary, window_minutes: 299, resets_in_seconds: 17_940 },
        secondary: { used_percent: secondary, window_minutes: 10_079, resets_in_seconds: 351_406 }
      }
    }
  });

describe("runHarness", () => {
  it("falls back from a fake Claude rate limit to fake Codex with a handoff", async () => {
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
    const launches: Array<{ command: string; args: string[] }> = [];
    const ptyFactory: PtyFactory = (command, args) => {
      launches.push({ command, args });
      if (command === "fake-claude") {
        return new FakePty({
          data: "rate limit reached",
          exitCode: 1,
          waitForKill: true
        });
      }

      return new FakePty({
        data: `received: ${args.join(" ")}`,
        exitCode: 0
      });
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts).toHaveLength(2);
    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
    expect(launches[0]?.args[0]).toContain("Keep this shared handoff file updated");
    expect(launches[1]?.args[0]).toContain("Switch reason: rate_limit");
    const handoff = await readFile(path.join(cwd, ".codepass", "current", "handoff.md"), "utf8");
    expect(handoff).toContain("Reason: rate_limit");
    expect(handoff).toContain("rate limit reached");
  });

  it("intercepts Ctrl+] and switches without forwarding it to the child PTY", async () => {
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
    const ptys: FakePty[] = [];
    const ptyFactory: PtyFactory = (command) => {
      const pty = command === "fake-claude"
        ? new FakePty({ data: "working", exitCode: 1, waitForKill: true })
        : new FakePty({ data: "continued", exitCode: 0 });
      ptys.push(pty);
      return pty;
    };
    const input = new PassThrough() as NodeJS.ReadStream;
    input.setRawMode = () => input;
    queueMicrotask(() => {
      input.write("\x1d");
    });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      input,
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("manual_switch");
    expect(ptys[0]?.writes).toEqual([]);
    expect(summary.finalProvider).toBe("codex");
  });

  it("writes bootstrap input to PTY providers after launch", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["aider"];
    config.harness.providers = [
      {
        name: "aider",
        label: "Aider",
        enabled: true,
        command: "fake-aider",
        args: [],
        handoffArgs: [],
        integrationType: "pty_with_bootstrap_input",
        bootstrapInput: "{{sessionPrompt}}\n"
      }
    ];
    const ptys: FakePty[] = [];
    const ptyFactory: PtyFactory = () => {
      const pty = new FakePty({ data: "ready", exitCode: 0 });
      ptys.push(pty);
      return pty;
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.success).toBe(true);
    expect(ptys[0]?.writes[0]).toContain("Keep this shared handoff file updated");
    expect(ptys[0]?.writes[0]).toContain(".codepass/current/handoff.md");
  });

  it("records a provider failure instead of crashing when the PTY factory throws", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["claude"];
    config.harness.providers = [
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: [],
        handoffArgs: [],
        integrationType: "pty_with_bootstrap_input",
        bootstrapInput: "{{sessionPrompt}}\n"
      }
    ];

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory: () => {
        throw new Error("posix_spawnp failed");
      },
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.success).toBe(false);
    expect(summary.attempts[0]).toMatchObject({
      provider: "claude",
      exitCode: 127,
      errorType: "unknown",
      transcriptExcerpt: "posix_spawnp failed"
    });
  });

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
      output: new PassThrough() as NodeJS.WriteStream
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
      output: new PassThrough() as NodeJS.WriteStream
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
      output: new PassThrough() as NodeJS.WriteStream
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
      output: new PassThrough() as NodeJS.WriteStream
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
      output: new PassThrough() as NodeJS.WriteStream
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
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
  });

  it("switches to the next provider when a provider goes idle past the timeout", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.idleTimeoutMs = 25;
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
        ? new FakePty({ data: "thinking", exitCode: 1, waitForKill: true })
        : new FakePty({ data: "continued", exitCode: 0 });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("timeout");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
  });

  it("honors a configured manual switch key", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.manualSwitchKey = "ctrl-\\";
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
        ? new FakePty({ data: "working", exitCode: 1, waitForKill: true })
        : new FakePty({ data: "continued", exitCode: 0 });
    const input = new PassThrough() as NodeJS.ReadStream;
    input.setRawMode = () => input;
    queueMicrotask(() => {
      input.write("\x1c");
    });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "codex"),
      input,
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("manual_switch");
    expect(summary.finalProvider).toBe("codex");
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
      output: new PassThrough() as NodeJS.WriteStream
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
      output: new PassThrough() as NodeJS.WriteStream
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
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]?.errorType).toBeUndefined();
    expect(launches).toEqual(["fake-claude"]);
  });

  it("switches when the usage probe sees codex cross its limit threshold", async () => {
    const cwd = await makeTempDir();
    const probeDir = await makeTempDir();
    const now = new Date();
    await writeRollout(probeDir, now, "rollout-a.jsonl", [rateLimitLine(10, 50)]); // under threshold at launch

    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.usageProbe.pollIntervalMs = 10;
    config.harness.providerOrder = ["codex", "claude"];
    config.harness.providers = [
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty",
        usageProbe: { kind: "codex-session-files" }
      },
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];

    const ptyFactory: PtyFactory = (command) => {
      if (command === "fake-codex") {
        // After launch, codex's own session file reports 97% weekly usage.
        setTimeout(() => {
          void appendFile(
            path.join(dayDir(probeDir, now), "rollout-a.jsonl"),
            `${rateLimitLine(12, 97)}\n`,
            "utf8"
          );
        }, 15);
        return new FakePty({ data: "working normally", exitCode: 1, waitForKill: true });
      }
      return new FakePty({ data: "continued", exitCode: 0 });
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      usageProbeOptions: { baseDir: probeDir, now: () => now },
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "claude"),
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.attempts[0]?.errorDetail).toContain("97% of its weekly limit");
    expect(summary.finalProvider).toBe("claude");
    const handoff = await readFile(path.join(cwd, ".codepass", "current", "handoff.md"), "utf8");
    expect(handoff).toContain("Reason: rate_limit");
    expect(handoff).toContain("97% of its weekly limit");
  });

  it("never fires the probe for a provider without usageProbe configured", async () => {
    const cwd = await makeTempDir();
    const probeDir = await makeTempDir();
    const now = new Date();
    await writeRollout(probeDir, now, "rollout-a.jsonl", [rateLimitLine(100, 100)]);

    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.usageProbe.pollIntervalMs = 5;
    config.harness.idleTimeoutMs = 50;
    config.harness.providerOrder = ["codex"];
    config.harness.providers = [
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

    const ptyFactory: PtyFactory = () => new FakePty({ data: "working", exitCode: 1, waitForKill: true });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      usageProbeOptions: { baseDir: probeDir, now: () => now },
      switchSelector: async () => undefined,
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("timeout");
    expect(summary.attempts[0]?.errorDetail).toBeUndefined();
  });

  it("respects fallbackOn: a probed provider that excludes rate_limit never probes", async () => {
    const cwd = await makeTempDir();
    const probeDir = await makeTempDir();
    const now = new Date();
    await writeRollout(probeDir, now, "rollout-a.jsonl", [rateLimitLine(100, 100)]);

    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.usageProbe.pollIntervalMs = 5;
    config.harness.idleTimeoutMs = 50;
    config.harness.providerOrder = ["codex"];
    config.harness.providers = [
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty",
        usageProbe: { kind: "codex-session-files" },
        fallbackOn: ["timeout"]
      }
    ];

    const ptyFactory: PtyFactory = () => new FakePty({ data: "working", exitCode: 1, waitForKill: true });

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      usageProbeOptions: { baseDir: probeDir, now: () => now },
      switchSelector: async () => undefined,
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("timeout");
  });

  it("skips launching a provider that is already over its limit at start", async () => {
    const cwd = await makeTempDir();
    const probeDir = await makeTempDir();
    const now = new Date();
    await writeRollout(probeDir, now, "rollout-a.jsonl", [rateLimitLine(97, 40)]);

    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["codex", "claude"];
    config.harness.providers = [
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty",
        usageProbe: { kind: "codex-session-files" }
      },
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "fake-claude",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      }
    ];

    const launches: string[] = [];
    const ptyFactory: PtyFactory = (command) => {
      launches.push(command);
      return new FakePty({ data: "continued", exitCode: 0 });
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      usageProbeOptions: { baseDir: probeDir, now: () => now },
      switchSelector: async (choices) => choices.find((choice) => choice.provider.name === "claude"),
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.attempts[0]?.exitCode).toBeNull();
    expect(launches).not.toContain("fake-codex");
    expect(launches).toEqual(["fake-claude"]);
    expect(summary.finalProvider).toBe("claude");
  });

  it("launches a probed provider under its (per-provider) threshold", async () => {
    const cwd = await makeTempDir();
    const probeDir = await makeTempDir();
    const now = new Date();
    await writeRollout(probeDir, now, "rollout-a.jsonl", [rateLimitLine(50, 50)]);

    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providerOrder = ["codex"];
    config.harness.providers = [
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "fake-codex",
        args: ["{{sessionPrompt}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty",
        usageProbe: { kind: "codex-session-files", thresholdPercent: 99 }
      }
    ];

    const launches: string[] = [];
    const ptyFactory: PtyFactory = (command) => {
      launches.push(command);
      return new FakePty({ data: "done", exitCode: 0 });
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      usageProbeOptions: { baseDir: probeDir, now: () => now },
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(launches).toEqual(["fake-codex"]);
    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]?.errorType).toBeUndefined();
    expect(summary.success).toBe(true);
  });

  it("refreshes the handoff's mechanical sections while a tool runs", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.autoAppendCheckpoints = false; // only the watcher writes
    config.harness.idleTimeoutMs = 1_400;
    config.harness.handoffRefresh.intervalMs = 1_000;
    config.harness.handoffRefresh.nudge.enabled = false;
    config.harness.providerOrder = ["solo"];
    config.harness.providers = [
      {
        name: "solo", label: "Solo", enabled: true, command: "fake-solo",
        args: ["{{sessionPrompt}}"], handoffArgs: ["{{handoffPrompt}}"], integrationType: "pty"
      }
    ];
    const ptyFactory: PtyFactory = () => new FakePty({ data: "working", exitCode: 1, waitForKill: true });

    await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async () => undefined,
      output: new PassThrough() as NodeJS.WriteStream
    });

    const content = await readFile(path.join(cwd, ".codepass", "current", "handoff.md"), "utf8");
    expect(content).toContain("## Repository Snapshot");
    expect(content).not.toContain("Recent diff:");
    // The watcher rewrote the snapshot to a time after the session-start line —
    // proof it fired (nothing else writes the file with autoAppendCheckpoints off).
    const startedLine = content.split("\n").find((line) => line.includes("Session started")) ?? "";
    const startedTs = startedLine.replace(/^- /, "").split("—")[0]?.trim();
    const refreshedTs = content.match(/Last refreshed: (\S+)/)?.[1];
    expect(refreshedTs).toBeDefined();
    expect(refreshedTs).not.toBe(startedTs);
  });

  it("nudges into the tool's PTY when the handoff goes stale mid-session", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.idleTimeoutMs = 1_300;
    config.harness.handoffRefresh.intervalMs = 1_000;
    config.harness.handoffRefresh.nudge = {
      enabled: true,
      staleAfterMs: 100,
      idleForMs: 50,
      minTranscriptGrowthChars: 5
    };
    config.harness.providerOrder = ["solo"];
    config.harness.providers = [
      {
        name: "solo", label: "Solo", enabled: true, command: "fake-solo",
        args: ["{{sessionPrompt}}"], handoffArgs: ["{{handoffPrompt}}"], integrationType: "pty"
      }
    ];
    let pty: FakePty | undefined;
    const ptyFactory: PtyFactory = () => {
      pty = new FakePty({ data: "working normally on the task", exitCode: 1, waitForKill: true });
      return pty;
    };

    await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async () => undefined,
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(pty?.writes.some((write) => write.includes("Please update the CodePass handoff file"))).toBe(true);
  });

  it("does not nudge when the nudge is disabled", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.idleTimeoutMs = 1_300;
    config.harness.handoffRefresh.intervalMs = 1_000;
    config.harness.handoffRefresh.nudge = {
      enabled: false,
      staleAfterMs: 100,
      idleForMs: 50,
      minTranscriptGrowthChars: 5
    };
    config.harness.providerOrder = ["solo"];
    config.harness.providers = [
      {
        name: "solo", label: "Solo", enabled: true, command: "fake-solo",
        args: ["{{sessionPrompt}}"], handoffArgs: ["{{handoffPrompt}}"], integrationType: "pty"
      }
    ];
    let pty: FakePty | undefined;
    const ptyFactory: PtyFactory = () => {
      pty = new FakePty({ data: "working normally on the task", exitCode: 1, waitForKill: true });
      return pty;
    };

    await runHarness({
      cwd,
      config,
      ptyFactory,
      switchSelector: async () => undefined,
      output: new PassThrough() as NodeJS.WriteStream
    });

    expect(pty?.writes.some((write) => write.includes("Please update the CodePass handoff file"))).toBe(false);
  });
});
