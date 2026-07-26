import chalk from "chalk";
import { initConfig } from "../config/index.js";
import type { CliOptions } from "../cli-options.js";

export const runInitCommand = async (options: CliOptions): Promise<void> => {
  try {
    const result = await initConfig(options.cwd ?? process.cwd(), options.config);
    const status = result.createdConfig ? "created" : "already exists";
    console.log(chalk.green(`keepitmovin config ${status}: ${result.configPath}`));
    console.log(chalk.gray("Created .keepitmovin/sessions and .keepitmovin/handoffs if needed."));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
