#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import { runClearCommand } from "./commands/clear.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runHandoffCommand } from "./commands/handoff.js";
import { runLaunchCommand } from "./commands/launch.js";
import { runProvidersCommand } from "./commands/providers.js";
import { runSessionCommand } from "./commands/session.js";
import { runMcpChangeCommand, runMcpServeCommand, runMcpStatusCommand } from "./commands/mcp.js";
import {
  resolveCommandOptions,
  splitExplicitTaskArgv,
  type CliOptions
} from "./cli-options.js";
import { reasoningEffortSchema, routingTierSchema } from "./routing/config.js";
import { installTerminalRestoreHook } from "./ui/restore.js";
import type { ReasoningEffort, RoutingTier } from "./config/types.js";

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

// Every command accepts the same two location flags. Declaring them through one
// helper keeps them in a single place while still letting commander parse them
// on either side of the subcommand name (`kim -c a.json doctor` and
// `kim doctor -c a.json` both work; resolveCommandOptions merges the two).
const declareCommand = (name: string, description: string, hidden = false): Command =>
  program
    .command(name, { hidden })
    .description(description)
    .option("-c, --config <path>", "Config file path")
    .option("--cwd <path>", "Working directory", process.cwd());

const withOptions =
  <T extends CliOptions>(handler: (options: T) => Promise<void>) =>
    async (rawOptions: T | Command, command?: Command): Promise<void> =>
      handler(resolveCommandOptions(rawOptions, command) as T);

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

declareCommand("providers", "Change which tools you use and their fallback order.")
  .option("--all", "Browse every tool, including ones that aren't verified yet")
  .option("--reset", "Start over from the built-in defaults instead of your saved settings")
  .action(withOptions(runProvidersCommand));

// `setup` is what `providers` used to be called; kept as a hidden alias so the
// old muscle memory (and any script) keeps working.
declareCommand("setup", "Alias for `kim providers`.", true)
  .option("--all", "Browse every tool, including ones that aren't verified yet")
  .option("--reset", "Start over from the built-in defaults instead of your saved settings")
  .action(withOptions(runProvidersCommand));

declareCommand("doctor", "Check your config, tools, git status, and file locations.")
  .option("--all", "Include tools that aren't verified yet")
  .action(withOptions(runDoctorCommand));

declareCommand("handoff", "Show the current handoff file's path and a preview.")
  .action(withOptions(runHandoffCommand));

declareCommand("clear", "Delete local handoff and session files.")
  .option("--yes", "Skip confirmation")
  .action(withOptions(runClearCommand));

declareCommand("session", "Show a summary of your most recent session.")
  .action(withOptions(runSessionCommand));

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
