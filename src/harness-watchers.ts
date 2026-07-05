import chalk from "chalk";
import type { HarnessAttemptLog, InteractiveProviderConfig, CodePassConfig } from "./types.js";
import { startHandoffWatcher } from "./handoff-refresh.js";
import {
  checkUsageThreshold,
  formatUsageProbeMessage,
  startUsageProbe,
  type ResolvedUsageProbe,
  type UsageProbeOptions,
  type UsageSnapshot
} from "./usage-probe.js";

// Pre-launch gate: when the provider's usage probe already reads at/over the
// threshold, return a synthetic rate_limit attempt so the harness switches
// without ever spawning the tool.
export const preLaunchUsageGate = async (args: {
  provider: InteractiveProviderConfig;
  resolvedProbe: ResolvedUsageProbe | undefined;
  usageProbeOptions?: UsageProbeOptions;
  command: string;
  commandArgs: string[];
  startedAt: string;
  output: NodeJS.WriteStream | undefined;
}): Promise<HarnessAttemptLog | undefined> => {
  const { provider, resolvedProbe, output } = args;
  if (!resolvedProbe) {
    return undefined;
  }

  const snapshot = await checkUsageThreshold(resolvedProbe, args.usageProbeOptions);
  if (!snapshot) {
    return undefined;
  }

  const detail = formatUsageProbeMessage(provider.label, snapshot, resolvedProbe.thresholdPercent);
  output?.write(chalk.yellow(`${detail} Skipping ${provider.label}.\n`));
  return {
    provider: provider.name,
    label: provider.label,
    command: args.command,
    args: args.commandArgs,
    startedAt: args.startedAt,
    endedAt: new Date().toISOString(),
    exitCode: null,
    errorType: "rate_limit",
    errorDetail: detail,
    transcriptExcerpt: detail
  };
};

export interface SessionWatcherContext {
  provider: InteractiveProviderConfig;
  config: CodePassConfig;
  cwd: string;
  handoffPath: string;
  resolvedProbe: ResolvedUsageProbe | undefined;
  usageProbeOptions?: UsageProbeOptions;
  transcriptLength: () => number;
  lastActivityAt: () => number;
  isSettled: () => boolean;
  writeToChild: (text: string) => void;
  onUsageLimit: (snapshot: UsageSnapshot) => void;
}

// Arms the usage-probe poller (when resolvedProbe is set) and the handoff
// watcher (when enabled). Returns a single stop() for cleanup.
export const armSessionWatchers = (ctx: SessionWatcherContext): (() => void) => {
  const stops: Array<() => void> = [];

  if (ctx.resolvedProbe) {
    stops.push(startUsageProbe(ctx.resolvedProbe, ctx.usageProbeOptions, ctx.onUsageLimit));
  }

  stops.push(
    startHandoffWatcher({
      cwd: ctx.cwd,
      config: ctx.config,
      handoffPath: ctx.handoffPath,
      transcriptLength: ctx.transcriptLength,
      lastActivityAt: ctx.lastActivityAt,
      isSettled: ctx.isSettled,
      writeToChild: ctx.writeToChild
    })
  );

  return () => stops.forEach((stop) => stop());
};
