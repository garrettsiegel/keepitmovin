import chalk from "chalk";
import { loadConfig } from "../config.js";
import { readLatestSessionLog } from "../session-log.js";
import type { CliOptions } from "../cli-options.js";

export const runSessionCommand = async (options: CliOptions): Promise<void> => {
  try {
    const cwd = options.cwd ?? process.cwd();
    const { config } = await loadConfig(cwd, options.config);
    const latest = await readLatestSessionLog(cwd, config);

    if (!latest) {
      console.log(chalk.yellow("No CodePass harness sessions found yet."));
      return;
    }

    console.log(chalk.bold("Latest CodePass session"));
    console.log("Started:", latest.startedAt);
    console.log("Ended:", latest.endedAt);
    console.log("Providers:", latest.providerOrder.join(" -> "));
    console.log("Attempts:", latest.attempts.length);
    console.log("Changed files:", latest.changedFiles.length);
    console.log("Log:", latest.sessionLogPath ?? "(unknown)");
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
