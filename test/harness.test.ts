import { readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { runHarness, type PtyFactory } from "../src/harness/index.js";
import { classifyTask } from "../src/routing/classify.js";
import { makeTempDir } from "./support/tmp.js";
import { FakePty } from "./support/fake-pty.js";

describe("runHarness — core lifecycle", () => {
  it("records routed launch metadata, handoff quality, and an explicit task outcome", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.routing.enabled = true;
    config.harness.providerOrder = ["claude"];
    config.harness.providers = [{
      name: "claude",
      label: "Claude Code",
      enabled: true,
      command: "fake-claude",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"],
      integrationType: "pty"
    }];
    const launches: Array<{ command: string; args: string[] }> = [];
    const ptyFactory: PtyFactory = (command, args) => {
      launches.push({ command, args });
      return new FakePty({
        data: `received: ${args.at(-1)?.replaceAll("\n", "\r\n")}`,
        exitCode: 0
      });
    };
    const input = new PassThrough() as unknown as NodeJS.ReadStream & { isTTY?: boolean };
    input.isTTY = true;

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      input,
      output: new PassThrough() as unknown as NodeJS.WriteStream,
      task: "Implement the approved plan",
      routeDecision: classifyTask({ task: "Implement the approved plan" }),
      outcomeSelector: async () => "completed"
    });

    expect(launches[0]?.args.slice(0, 4)).toEqual(["--model", "sonnet", "--effort", "medium"]);
    expect(summary.attempts[0]?.route).toMatchObject({ tier: "standard", model: "sonnet" });
    expect(summary.outcome).toBe("completed");
    expect(summary.handoffQuality).toMatchObject({ taskInitialized: true, narrativeUpdated: false });
    const handoff = await readFile(path.join(cwd, ".keepitmovin", "current", "handoff.md"), "utf8");
    expect(handoff).toContain("The final provider process exited cleanly. Reported task outcome: completed.");
    expect(handoff).not.toContain("Complete this task:");
  });

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
      task: "Fix checkout",
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts).toHaveLength(2);
    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.finalProvider).toBe("codex");
    expect(summary.success).toBe(true);
    expect(launches[0]?.args[0]).toContain("Keep this shared handoff file updated");
    expect(launches[0]?.args[0]).toContain("Fix checkout");
    expect(launches[1]?.args[0]).toContain("Switch reason: rate_limit");
    const handoff = await readFile(path.join(cwd, ".keepitmovin", "current", "handoff.md"), "utf8");
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
    const input = new PassThrough() as unknown as NodeJS.ReadStream;
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
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
        name: "fake-bootstrap",
        label: "Bootstrap Tool",
        enabled: true,
        command: "fake-aider",
        args: [],
        handoffArgs: [],
        integrationType: "pty_with_bootstrap_input",
        bootstrapInput:
          "Read the keepitmovin handoff at {{handoffPath}} and continue the session (keep that file updated as you work).\n"
      }
    ];
    config.harness.providerOrder = ["fake-bootstrap"];
    const ptys: FakePty[] = [];
    const ptyFactory: PtyFactory = () => {
      // Stay alive after the splash "ready" so the deferred bootstrap paste can
      // land, then exit once it arrives.
      const pty = new FakePty({ data: "ready", exitCode: 0, exitOnWrite: true });
      ptys.push(pty);
      return pty;
    };

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.success).toBe(true);
    expect(ptys[0]?.writes[0]).toContain("Read the keepitmovin handoff at");
    expect(ptys[0]?.writes[0]).toContain(".keepitmovin/current/handoff.md");
  });

  it("holds early keystrokes until the bootstrap paste lands, then flushes them", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.setupComplete = true;
    config.harness.providers = [
      {
        name: "fake-bootstrap",
        label: "Bootstrap Tool",
        enabled: true,
        command: "fake-aider",
        args: [],
        handoffArgs: [],
        integrationType: "pty_with_bootstrap_input",
        bootstrapInput: "BOOT:{{sessionPrompt}}\n"
      }
    ];
    config.harness.providerOrder = ["fake-bootstrap"];
    const ptys: FakePty[] = [];
    const ptyFactory: PtyFactory = () => {
      const pty = new FakePty({ data: "ready", exitCode: 0, exitOnWrite: true });
      ptys.push(pty);
      return pty;
    };

    const input = new PassThrough();
    // Type before the deferred bootstrap paste has landed (well inside the lull).
    setTimeout(() => input.write("typed-early"), 50);

    const summary = await runHarness({
      cwd,
      config,
      ptyFactory,
      input: input as unknown as NodeJS.ReadStream,
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.success).toBe(true);
    const writes = ptys[0]?.writes ?? [];
    // Bootstrap paste is written first; the buffered keystrokes follow it — never
    // interleaved into the middle of the pasted prompt.
    expect(writes[0]).toContain("BOOT:");
    expect(writes[1]).toBe("typed-early");
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.success).toBe(false);
    expect(summary.attempts[0]).toMatchObject({
      provider: "claude",
      exitCode: 127,
      errorType: "unknown",
      transcriptExcerpt: "posix_spawnp failed"
    });
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
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
    const input = new PassThrough() as unknown as NodeJS.ReadStream;
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("manual_switch");
    expect(summary.finalProvider).toBe("codex");
  });

});

describe("runHarness — session lifecycle guards", () => {
  const twoProviders = [
    {
      name: "claude",
      label: "Claude Code",
      enabled: true,
      command: "fake-claude",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"],
      integrationType: "pty" as const
    },
    {
      name: "codex",
      label: "Codex",
      enabled: true,
      command: "fake-codex",
      args: ["{{sessionPrompt}}"],
      handoffArgs: ["{{handoffPrompt}}"],
      integrationType: "pty" as const
    }
  ];

  it("stops after a bounded number of switches instead of ping-ponging forever", async () => {
    // Both tools fail every time. With two providers the switch menu auto-picks
    // the only other one, so before the budget this looped A -> B -> A forever.
    const cwd = await makeTempDir();
    const config = defaultConfig();

    const ptyFactory: PtyFactory = () =>
      new FakePty({ data: "Error: rate limit exceeded\n", exitCode: 1 });

    const summary = await runHarness({
      cwd,
      config,
      providers: twoProviders,
      ptyFactory,
      switchSelector: async (choices) => choices[0],
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.success).toBe(false);
    // providers.length * 2 switches, so the initial attempt plus that many more.
    expect(summary.attempts.length).toBe(twoProviders.length * 2 + 1);
  });

  it("treats Ctrl-C as ending the session, not as a reason to switch tools", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();

    const ptyFactory: PtyFactory = () => {
      const pty = new FakePty({ data: "working...", exitCode: 0, waitForKill: true });
      // Fire the abort once the attempt is live and mirroring input.
      setTimeout(() => process.emit("SIGINT"), 10);
      return pty;
    };

    const summary = await runHarness({
      cwd,
      config,
      providers: twoProviders,
      ptyFactory,
      switchSelector: async (choices) => choices[0],
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.aborted).toBe(true);
    expect(summary.success).toBe(false);
    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]?.errorType).toBe("aborted");
    expect(summary.finalProvider).toBe("claude");
  });
});
