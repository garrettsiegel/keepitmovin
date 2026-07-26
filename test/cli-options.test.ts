import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  EXPLICIT_TASK_SENTINEL,
  resolveCommandOptions,
  splitExplicitTaskArgv,
  type CliOptions
} from "../src/cli-options.js";

/** Mirrors cli.ts: --config/--cwd on the root program *and* on each subcommand. */
const runKim = (argv: string[]): CliOptions => {
  let captured: CliOptions = {};

  const program = new Command();
  program
    .name("kim")
    .option("-c, --config <path>", "Config file path")
    .option("--cwd <path>", "Working directory");

  program
    .command("doctor")
    .option("-c, --config <path>", "Config file path")
    .option("--cwd <path>", "Working directory")
    .action((options: CliOptions, command: Command) => {
      captured = resolveCommandOptions(options, command);
    });

  program.exitOverride();
  program.parse(["node", "kim", ...argv]);
  return captured;
};

describe("resolveCommandOptions", () => {
  it("sees a root option given before the subcommand", () => {
    // The reason this helper exists: commander parses `--cwd` here onto the
    // parent, so the subcommand's own opts() would not contain it.
    expect(runKim(["--cwd", "/tmp/project", "doctor"]).cwd).toBe("/tmp/project");
  });

  it("sees an option given after the subcommand", () => {
    expect(runKim(["doctor", "--cwd", "/tmp/project"]).cwd).toBe("/tmp/project");
  });

  it("lets the subcommand's own value win over the root's", () => {
    expect(runKim(["--cwd", "/root", "doctor", "--cwd", "/sub"]).cwd).toBe("/sub");
  });

  it("supports the concatenated short-option form", () => {
    // The previous hand-rolled argv scan only understood `-c value` and
    // `-c=value`, so this form silently fell through to undefined.
    expect(runKim(["doctor", "-c/tmp/kim.json"]).config).toBe("/tmp/kim.json");
  });

  it("supports the --config=value form", () => {
    expect(runKim(["doctor", "--config=/tmp/kim.json"]).config).toBe("/tmp/kim.json");
  });

  it("follows commander for `-c=value`, where = is part of the value", () => {
    // Documented commander behavior: `=` separates only long options. The old
    // hand-rolled argv scan accepted `-c=value` and stripped the `=`, so this is
    // a deliberate behavior change toward the standard parsing.
    expect(runKim(["doctor", "-c=/tmp/kim.json"]).config).toBe("=/tmp/kim.json");
  });
});

describe("splitExplicitTaskArgv", () => {
  it("does not let task text after -- be reparsed as CLI options", () => {
    // Everything after `--` is lifted out before commander ever sees it, so a
    // task that happens to contain `--cwd` cannot redirect the working directory.
    const split = splitExplicitTaskArgv(["node", "kim", "--", "review", "--cwd", "/untrusted"]);

    expect(split.task).toBe("review --cwd /untrusted");
    expect(split.argv).toEqual(["node", "kim", EXPLICIT_TASK_SENTINEL]);
    expect(split.argv).not.toContain("--cwd");
  });

  it("protects an explicit task that has the same name as a subcommand", () => {
    expect(
      splitExplicitTaskArgv(["node", "kim", "--cwd", "/tmp/project", "--", "init"])
    ).toEqual({
      argv: ["node", "kim", "--cwd", "/tmp/project", EXPLICIT_TASK_SENTINEL],
      task: "init"
    });
  });

  it("leaves argv alone when there is no -- separator", () => {
    expect(splitExplicitTaskArgv(["node", "kim", "doctor"])).toEqual({
      argv: ["node", "kim", "doctor"]
    });
  });
});
