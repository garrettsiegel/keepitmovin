#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import { runClearCommand } from "./commands/clear.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runHandoffCommand } from "./commands/handoff.js";
import { runInitCommand } from "./commands/init.js";
import { runLaunchCommand } from "./commands/launch.js";
import { runProvidersCommand } from "./commands/providers.js";
import { runSessionCommand } from "./commands/session.js";
import { runSetupCommand } from "./commands/setup.js";
import { runMcpChangeCommand, runMcpServeCommand, runMcpStatusCommand } from "./commands/mcp.js";
import {
  resolveCommandOptions,
  splitExplicitTaskArgv,
  type CliOptions
} from "./cli-options.js";
import { reasoningEffortSchema, routingTierSchema } from "./routing-config.js";
import { installTerminalRestoreHook } from "./terminal-restore.js";
import type { ReasoningEffort, RoutingTier } from "./types.js";

const parseTier = (value: string): RoutingTier => {
  const parsed = routingTierSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidArgumentError("Use one of: light, standard, deep, max.");
  }
  return parsed.data;
};

const parseEffort = (value: string): ReasoningEffort => {
  const parsed = reasoningEffortSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidArgumentError("Use one of: low, medium, high, xhigh, max, ultra.");
  }
  return parsed.data;
};

// Read the version from package.json at runtime so `--version` can never drift
// from the published package (this file compiles to dist/cli.js, one level
// below the package root where package.json lives).
const packageJsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
const explicitTask = splitExplicitTaskArgv(process.argv);

const program = new Command();

program
  .name("kim")
  .description("Run your AI coding tools in one terminal, with automatic handoff when one hits a limit. Works with Claude Code, Codex, Kimi CLI, Google Antigravity, opencode, Grok Build, Cursor Agent, GitHub Copilot CLI, and Ollama.")
  .version(version);

program
  .argument("[task...]", "What you want to work on")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--tier <tier>", "Override routing tier", parseTier)
  .option("--model <model>", "Override the routed model")
  .option("--effort <effort>", "Override reasoning effort", parseEffort)
  .option("--no-route", "Disable routing for this run")
  .action(async (task: string[] | undefined, rawOptions: CliOptions | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command);
    const taskText = explicitTask.task ?? (task?.join(" ").trim() || undefined);
    await runLaunchCommand({ ...options, task: taskText });
  });

program
  .command("init")
  .description("Create the keepitmovin config file and local folders.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runInitCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("doctor")
  .description("Check your config, tools, git status, and file locations.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--all", "Include tools that aren't verified yet")
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runDoctorCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("handoff")
  .description("Show the current handoff file's path and a preview.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runHandoffCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("clear")
  .description("Delete local handoff and session files.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--yes", "Skip confirmation")
  .action(async (rawOptions: (CliOptions & { yes?: boolean }) | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command) as CliOptions & { yes?: boolean };
    await runClearCommand(options);
  });

program
  .command("setup")
  .description("Run the guided setup: pick your tools and their order.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runSetupCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("providers")
  .description("Change which tools you use and their fallback order.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--all", "Browse every tool, including ones that aren't verified yet")
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runProvidersCommand(resolveCommandOptions(rawOptions, command));
  });

program
  .command("session")
  .description("Show a summary of your most recent session.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    await runSessionCommand(resolveCommandOptions(rawOptions, command));
  });

const mcp = program
  .command("mcp")
  .description("Serve or install keepitmovin's read-only MCP continuity integration.");

mcp
  .command("serve")
  .description("Start the local read-only MCP server over stdio.")
  .option("--cwd <path>", "Fallback project directory", process.cwd())
  .action(async (options: { cwd?: string }) => {
    await runMcpServeCommand({ cwd: options.cwd, version });
  });

mcp
  .command("status")
  .description("Show MCP support and installation status for every keepitmovin tool.")
  .action(runMcpStatusCommand);

mcp
  .command("install")
  .description("Preview and install the MCP entry user-wide in every capable client.")
  .action(async () => runMcpChangeCommand("install"));

mcp
  .command("remove")
  .description("Preview and remove only keepitmovin-owned MCP entries.")
  .action(async () => runMcpChangeCommand("remove"));

// Last-resort guard so a crash never leaves the terminal in raw mode.
installTerminalRestoreHook();

await program.parseAsync(explicitTask.argv);
