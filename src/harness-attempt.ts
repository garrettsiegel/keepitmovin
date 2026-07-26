import process from "node:process";
import chalk from "chalk";
import type { ProviderLaunch } from "./interactive-provider.js";
import { formatCommandEcho } from "./interactive-provider.js";
import type { PtyFactory, PtyProcess } from "./pty-factory.js";
import type { AppliedRoute, HarnessAttemptLog, InteractiveProviderConfig } from "./types.js";
import { preLaunchUsageGate } from "./harness-watchers.js";
import type { ResolvedUsageProbe, UsageProbeOptions } from "./usage-probe.js";
import { buildAttemptLog } from "./harness-attempt-log.js";

type StartOptions = {
  provider: InteractiveProviderConfig;
  launch: ProviderLaunch;
  cwd: string;
  startedAt: string;
  route?: AppliedRoute;
  expectsReceipt: boolean;
  ptyFactory: PtyFactory;
  resolvedProbe?: ResolvedUsageProbe;
  usageProbeOptions?: UsageProbeOptions;
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
    usageProbeOptions: options.usageProbeOptions,
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
      return { child: options.ptyFactory(launch.command, launch.args, {
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
