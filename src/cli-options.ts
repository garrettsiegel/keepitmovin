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
  reset?: boolean;
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

/**
 * Normalizes a subcommand's options.
 *
 * `--config` and `--cwd` are declared on the root program as well as on each
 * subcommand, so `kim --config x.json doctor` parses them onto the *parent*.
 * `optsWithGlobals()` merges the parent's values in (the subcommand's own win),
 * which is what this used to approximate by re-scanning process.argv by hand --
 * a second parser that missed commander's concatenated short-option form
 * (`-cvalue`) and ignored which subcommand was actually running.
 */
export const resolveCommandOptions = (
  rawOptions: CliOptions | Command,
  command?: Command
): CliOptions => {
  const commandCandidate = command ?? (rawOptions instanceof Command ? rawOptions : undefined);
  return commandCandidate?.optsWithGlobals<CliOptions>() ?? (rawOptions as CliOptions);
};
