import { Command } from "commander";
import type { ReasoningEffort, RoutingTier } from "./config/types.js";

export const EXPLICIT_TASK_SENTINEL = "__keepitmovin_explicit_task__";

export interface CliOptions {
  all?: boolean;
  config?: string;
  cwd?: string;
  dryRun?: boolean;
  maxRetries?: string;
  printPrompt?: boolean;
  provider?: string;
  task?: string;
  tier?: RoutingTier;
  model?: string;
  effort?: ReasoningEffort;
  route?: boolean;
}

export const splitExplicitTaskArgv = (
  argv: string[]
): { argv: string[]; task?: string } => {
  const separator = argv.indexOf("--");
  if (separator < 0) {
    return { argv };
  }

  const task = argv.slice(separator + 1).join(" ").trim();
  return {
    argv: task
      ? [...argv.slice(0, separator), EXPLICIT_TASK_SENTINEL]
      : argv.slice(0, separator),
    ...(task ? { task } : {})
  };
};

export const readOptionFromArgv = (names: string[]): string | undefined => {
  const separator = process.argv.indexOf("--");
  const argv = separator >= 0 ? process.argv.slice(0, separator) : process.argv;
  for (const [index, arg] of argv.entries()) {
    for (const name of names) {
      if (arg === name) {
        return argv[index + 1];
      }

      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1);
      }
    }
  }

  return undefined;
};

export const resolveCommandOptions = (
  rawOptions: CliOptions | Command,
  command?: Command
): CliOptions => {
  const commandCandidate = command ?? (rawOptions instanceof Command ? rawOptions : undefined);
  const parsedOptions = commandCandidate?.opts<CliOptions>() ?? rawOptions as CliOptions;

  return {
    ...parsedOptions,
    config: readOptionFromArgv(["--config", "-c"]) ?? parsedOptions.config,
    cwd: readOptionFromArgv(["--cwd"]) ?? parsedOptions.cwd
  };
};
