import chalk from "chalk";
import { initConfig } from "../config.js";
import type { CliOptions } from "../cli-options.js";

export const runInitCommand = async (options: CliOptions): Promise<void> => {
  try {
    const result = await initConfig(options.cwd ?? process.cwd(), options.config);
    const status = result.createdConfig ? "created" : "already exists";
    console.log(chalk.green(`CodePass config ${status}: ${result.configPath}`));
    console.log(chalk.gray("Created .codepass/runs and .codepass/logs if needed."));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
