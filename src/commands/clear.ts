import chalk from "chalk";
import { confirm, isCancel } from "@clack/prompts";
import { withConfig } from "../cli-options.js";
import { clearHandoffArtifacts } from "../handoff/file.js";

export const runClearCommand = withConfig(async ({ cwd, config, options }) => {
  const confirmation = options.yes ?? await confirm({
    message: "Delete keepitmovin's local handoff and session files?",
    initialValue: false
  });

  if (isCancel(confirmation) || !confirmation) {
    console.log("Canceled — nothing was deleted.");
    return;
  }

  const removed = await clearHandoffArtifacts(cwd, config);
  console.log(
    removed.length > 0
      ? chalk.green(`Deleted ${removed.length} location(s).`)
      : chalk.gray("Nothing to delete — no handoff or session files found.")
  );
});
