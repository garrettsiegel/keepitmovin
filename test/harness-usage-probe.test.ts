import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runHarness, type PtyFactory } from "../src/harness.js";
import { makeTempDir } from "./support/tmp.js";
import { FakePty } from "./support/fake-pty.js";
import { dayDir, rateLimitLine, writeRollout } from "./support/codex-rollout.js";

describe("runHarness — usage probe", () => {
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    expect(summary.attempts[0]?.errorDetail).toContain("97% of its weekly limit");
    expect(summary.finalProvider).toBe("claude");
    const handoff = await readFile(path.join(cwd, ".keepitmovin", "current", "handoff.md"), "utf8");
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
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
      output: new PassThrough() as unknown as NodeJS.WriteStream
    });

    expect(launches).toEqual(["fake-codex"]);
    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]?.errorType).toBeUndefined();
    expect(summary.success).toBe(true);
  });

});
