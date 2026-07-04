#!/usr/bin/env node
import { Command } from "commander";
import { runClearCommand } from "./commands/clear.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runHandoffCommand } from "./commands/handoff.js";
import { runInitCommand } from "./commands/init.js";
import { runLaunchCommand } from "./commands/launch.js";
import { runProvidersCommand } from "./commands/providers.js";
import { runSessionCommand } from "./commands/session.js";
import { runSetupCommand } from "./commands/setup.js";
import { resolveCommandOptions, type CliOptions } from "./cli-options.js";

// Support `codepass -- <args>` by stripping the `--` separator; the bare
// `codepass` invocation launches the interactive harness (default action).
const normalizeArgv = (argv: string[]): string[] =>
  argv[2] === "--" ? [argv[0] ?? "node", argv[1] ?? "codepass", ...argv.slice(3)] : argv;

const program = new Command();

program
  .name("codepass")
  .description("Interactive agent harness for Claude Code, Codex, Antigravity, opencode, Cline, and more.")
  .version("0.0.1");

program
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (options: CliOptions) => {
    await runLaunchCommand(options);
  });

program
  .command("init")
  .description("Create CodePass config and local run log directories.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runInitCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("doctor")
  .description("Check CodePass config, provider commands, git context, and log paths.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--all", "Show the full popular provider catalog")
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runDoctorCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("handoff")
  .description("Show the current CodePass handoff file path and preview.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runHandoffCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("clear")
  .description("Delete local CodePass handoff and harness session artifacts.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--yes", "Skip confirmation")
  .action(async (rawOptions: (CliOptions & { yes?: boolean }) | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command) as CliOptions & { yes?: boolean };
    await runClearCommand(options);
  });

program
  .command("setup")
  .description("Run the guided CodePass harness setup wizard.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runSetupCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("providers")
  .description("Edit the CodePass harness provider order.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--all", "Browse the full popular provider catalog while editing")
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runProvidersCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("session")
  .description("Show the latest CodePass harness session summary.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runSessionCommand(resolveCommandOptions(rawOptions, command));
  });

await program.parseAsync(normalizeArgv(process.argv));
