import chalk from "chalk";
import { runSetupWizard } from "../setup.js";
import type { CliOptions } from "../cli-options.js";

export const runSetupCommand = async (options: CliOptions): Promise<void> => {
  try {
    await runSetupWizard({
      cwd: options.cwd ?? process.cwd(),
      configPath: options.config,
      force: true
    });
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
