import process from "node:process";
import chalk from "chalk";
import type { ProviderLaunch } from "../providers/interactive.js";
import { formatCommandEcho } from "../providers/interactive.js";
import { defaultPtyFactory, type PtyProcess } from "../pty/factory.js";
import type { AppliedRoute, HarnessAttemptLog, InteractiveProviderConfig } from "../config/types.js";
import { preLaunchUsageGate } from "./watchers.js";
import type { ResolvedUsageProbe } from "../probes/usage.js";
import { buildAttemptLog } from "./attempt-log.js";

type StartOptions = {
  provider: InteractiveProviderConfig;
  launch: ProviderLaunch;
  cwd: string;
  startedAt: string;
  route?: AppliedRoute;
  expectsReceipt: boolean;
  resolvedProbe?: ResolvedUsageProbe;
  output?: NodeJS.WriteStream;
};

export const startHarnessAttempt = async (
  options: StartOptions
): Promise<{
  attempt: HarnessAttemptLog;
} | {
  spawn: () => { child: PtyProcess } | { attempt: HarnessAttemptLog };
}> => {
  const { provider, launch, startedAt, output } = options;
  const gated = await preLaunchUsageGate({
    provider,
    resolvedProbe: options.resolvedProbe,
    command: launch.command,
    commandArgs: launch.args,
    startedAt,
    output
  });
  if (gated) {
    return { attempt: {
      ...gated,
      handoffReceipt: { status: options.expectsReceipt ? "missing" : "not_applicable" },
      ...(options.route ? { route: options.route } : {})
    } };
  }

  return { spawn: () => {
    output?.write(chalk.cyan(`\nStarting ${provider.label}…\n`));
    output?.write(chalk.gray(`Command: ${formatCommandEcho(launch.command, launch.args)}\n\n`));
    try {
      return { child: defaultPtyFactory(launch.command, launch.args, {
        cwd: options.cwd,
        env: process.env
      }) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output?.write(chalk.yellow(`keepitmovin could not start ${provider.label}: ${message}\n`));
      const missing = /not found|enoent/i.test(message);
      return { attempt: buildAttemptLog(
        { provider, command: launch.command, args: launch.args, startedAt, route: options.route },
        {
          exitCode: 127,
          errorType: missing ? "command_not_found" : "unknown",
          transcriptExcerpt: message
        }
      ) };
    }
  } };
};
