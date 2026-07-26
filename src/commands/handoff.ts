import chalk from "chalk";
import { withConfig } from "../cli-options.js";
import { summarizeHandoffFile } from "../handoff/file.js";

export const runHandoffCommand = withConfig(async ({ cwd, config }) => {
  const handoff = await summarizeHandoffFile(cwd, config);

  console.log(chalk.bold("keepitmovin handoff file"));
  console.log("Path:", handoff.path);
  console.log("Status:", handoff.exists ? chalk.green("exists") : chalk.yellow("not created yet"));
  console.log("");
  console.log(handoff.summary);
});
