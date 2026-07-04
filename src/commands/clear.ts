import chalk from "chalk";
import { confirm, isCancel } from "@clack/prompts";
import { loadConfig } from "../config.js";
import { clearHandoffArtifacts } from "../handoff-file.js";
import type { CliOptions } from "../cli-options.js";

export const runClearCommand = async (
  options: CliOptions & { yes?: boolean }
): Promise<void> => {
  try {
    const cwd = options.cwd ?? process.cwd();
    const { config } = await loadConfig(cwd, options.config);
    const confirmation = options.yes ?? await confirm({
      message: "Delete local CodePass handoffs and harness session logs?",
      initialValue: false
    });
    const shouldClear = !isCancel(confirmation) && confirmation;

    if (!shouldClear) {
      console.log("CodePass clear cancelled.");
      return;
    }

    const removed = await clearHandoffArtifacts(cwd, config);
    console.log(
      removed.length > 0
        ? chalk.green(`Cleared ${removed.length} CodePass artifact location(s).`)
        : chalk.gray("No CodePass handoff/session artifacts found.")
    );
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
