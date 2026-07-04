import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runCodePass } from "../src/run.js";
import type { CodePassConfig } from "../src/types.js";

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-run-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

const writeConfig = async (cwd: string, config: CodePassConfig): Promise<string> => {
  const configPath = path.join(cwd, "codepass.config.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
};

const nodeProvider = (
  name: string,
  script: string,
  enabled = true
): CodePassConfig["providers"][number] => ({
  name,
  enabled,
  command: process.execPath,
  args: ["-e", script, "{{prompt}}"],
  timeoutMs: 5_000
});

describe("runCodePass", () => {
  it("stops on the first successful provider", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.providers = [
      nodeProvider("first", "require('fs').writeFileSync('first.txt', 'ok')"),
      nodeProvider("second", "require('fs').writeFileSync('second.txt', 'ok')")
    ];
    await writeConfig(cwd, config);

    const summary = await runCodePass("do work", {
      cwd,
      dryRun: false
    });

    expect(summary.success).toBe(true);
    expect(summary.providersTried).toEqual(["first"]);
    await expect(readFile(path.join(cwd, "first.txt"), "utf8")).resolves.toBe("ok");
    await expect(stat(path.join(cwd, "second.txt"))).rejects.toThrow();
  });

  it("falls back on eligible provider failure", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.providers = [
      nodeProvider("first", "process.stderr.write('rate limit reached'); process.exit(1)"),
      nodeProvider("second", "require('fs').writeFileSync('second.txt', 'ok')")
    ];
    await writeConfig(cwd, config);

    const summary = await runCodePass("do work", {
      cwd,
      dryRun: false
    });

    expect(summary.success).toBe(true);
    expect(summary.providersTried).toEqual(["first", "second"]);
    expect(summary.attempts[0]?.errorType).toBe("rate_limit");
    await expect(readFile(path.join(cwd, "second.txt"), "utf8")).resolves.toBe("ok");
  });

  it("honors provider selection", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.providers = [
      nodeProvider("first", "require('fs').writeFileSync('first.txt', 'ok')"),
      nodeProvider("second", "require('fs').writeFileSync('second.txt', 'ok')")
    ];
    await writeConfig(cwd, config);

    const summary = await runCodePass("do work", {
      cwd,
      dryRun: false,
      provider: "second"
    });

    expect(summary.success).toBe(true);
    expect(summary.providerOrder).toEqual(["second"]);
    await expect(stat(path.join(cwd, "first.txt"))).rejects.toThrow();
    await expect(readFile(path.join(cwd, "second.txt"), "utf8")).resolves.toBe("ok");
  });

  it("writes a JSON run log", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.providers = [nodeProvider("first", "process.stdout.write('done')")];
    await writeConfig(cwd, config);

    const summary = await runCodePass("do work", {
      cwd,
      dryRun: false
    });
    const log = JSON.parse(await readFile(summary.logPath ?? "", "utf8")) as {
      task: string;
      attempts: Array<{ provider: string; stdout: string; prompt: string }>;
    };

    expect(log.task).toBe("do work");
    expect(log.attempts[0]?.provider).toBe("first");
    expect(log.attempts[0]?.stdout).toBe("done");
    expect(log.attempts[0]?.prompt).toContain("do work");
  });

  it("creates a local checkpoint commit before running when enabled", async () => {
    const cwd = await makeTempDir();
    await execa("git", ["init"], { cwd });
    await execa("git", ["config", "user.email", "codepass@test.local"], { cwd });
    await execa("git", ["config", "user.name", "CodePass Test"], { cwd });
    await writeFile(path.join(cwd, "seed.txt"), "seed", "utf8");
    await execa("git", ["add", "-A"], { cwd });
    await execa("git", ["commit", "-m", "init"], { cwd });

    const config = defaultConfig();
    config.git.createCheckpointCommit = true;
    config.providers = [nodeProvider("first", "process.stdout.write('done')")];
    await writeConfig(cwd, config);
    await writeFile(path.join(cwd, "work.txt"), "wip", "utf8");

    const summary = await runCodePass("do work", { cwd, dryRun: false });

    expect(summary.success).toBe(true);
    const log = await execa("git", ["log", "--oneline"], { cwd });
    expect(log.stdout).toContain("codepass: checkpoint before \"do work\"");
    // The pre-run change was captured by the checkpoint, not left dangling.
    const committed = await execa("git", ["show", "--stat", "HEAD"], { cwd });
    expect(committed.stdout).toContain("work.txt");
  });

  it("does not invoke providers on dry run", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.providers = [
      nodeProvider("first", "require('fs').writeFileSync('should-not-exist.txt', 'nope')")
    ];
    await writeConfig(cwd, config);

    const summary = await runCodePass("do work", {
      cwd,
      dryRun: true
    });

    expect(summary.success).toBe(true);
    expect(summary.finalProvider).toBe("dry-run");
    await expect(stat(path.join(cwd, "should-not-exist.txt"))).rejects.toThrow();
  });
});
