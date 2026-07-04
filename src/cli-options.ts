import { Command } from "commander";

export interface CliOptions {
  all?: boolean;
  config?: string;
  cwd?: string;
  dryRun?: boolean;
  maxRetries?: string;
  printPrompt?: boolean;
  provider?: string;
}

export const readOptionFromArgv = (names: string[]): string | undefined => {
  for (const [index, arg] of process.argv.entries()) {
    for (const name of names) {
      if (arg === name) {
        return process.argv[index + 1];
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
