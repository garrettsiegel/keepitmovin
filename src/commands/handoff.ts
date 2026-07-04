import chalk from "chalk";
import { loadConfig } from "../config.js";
import { summarizeHandoffFile } from "../handoff-file.js";
import type { CliOptions } from "../cli-options.js";

export const runHandoffCommand = async (options: CliOptions): Promise<void> => {
  try {
    const cwd = options.cwd ?? process.cwd();
    const { config } = await loadConfig(cwd, options.config);
    const handoff = await summarizeHandoffFile(cwd, config);

    console.log(chalk.bold("CodePass handoff file"));
    console.log("Path:", handoff.path);
    console.log("Status:", handoff.exists ? chalk.green("exists") : chalk.yellow("not created yet"));
    console.log("");
    console.log(handoff.summary);
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
