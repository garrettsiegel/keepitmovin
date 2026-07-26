import chalk from "chalk";
import { withConfig } from "../cli-options.js";
import { readLatestSessionLog } from "../util/session-log.js";

export const runSessionCommand = withConfig(async ({ cwd, config }) => {
  const latest = await readLatestSessionLog(cwd, config);

  if (!latest) {
    console.log(chalk.yellow("No sessions yet."));
    return;
  }

  console.log(chalk.bold("Latest keepitmovin session"));
  console.log("Started:", latest.startedAt);
  console.log("Ended:", latest.endedAt);
  console.log("Tools:", latest.providerOrder.join(" -> "));
  console.log("Attempts:", latest.attempts.length);
  console.log("Tool process:", latest.success ? "exited cleanly" : "did not exit cleanly");
  console.log("Changed files:", latest.changedFiles.length);
  if (latest.routeDecision) {
    console.log("Route:", `${latest.routeDecision.tier} (${latest.routeDecision.reason})`);
    const applied = [...latest.attempts].reverse().find((attempt) => attempt.route)?.route;
    if (applied) {
      console.log(
        "Applied model:",
        `${applied.provider}: ${applied.model ?? "provider default"}` +
        `${applied.effort ? ` / ${applied.effort}` : ""}`
      );
    }
  }
  if (latest.outcome) {
    console.log("Task outcome:", latest.outcome);
  }
  if (latest.handoffQuality) {
    const { taskInitialized, narrativeUpdated, placeholdersRemaining } = latest.handoffQuality;
    console.log(
      "Handoff quality:",
      `task ${taskInitialized ? "recorded" : "missing"}, narrative ${narrativeUpdated ? "updated" : "stale"}` +
      `${placeholdersRemaining.length > 0 ? `, placeholders: ${placeholdersRemaining.join(", ")}` : ""}`
    );
  }
  const receipts = latest.attempts.filter((attempt) => attempt.handoffReceipt?.status !== "not_applicable");
  if (receipts.length > 0) {
    const received = receipts.filter((attempt) => attempt.handoffReceipt?.status === "received").length;
    console.log("Handoff receipts:", `${received}/${receipts.length} received`);
  }
  const compactions = latest.attempts.reduce(
    (count, attempt) => count + (attempt.compactionEvents?.length ?? 0),
    0
  );
  if (compactions > 0) console.log("Compactions recovered:", compactions);
  const watchdogWarnings = latest.attempts.reduce(
    (count, attempt) => count + (attempt.watchdogEvents?.length ?? 0),
    0
  );
  if (watchdogWarnings > 0) console.log("Watchdog warnings:", watchdogWarnings);
  console.log("Log:", latest.sessionLogPath ?? "(unknown)");
});
