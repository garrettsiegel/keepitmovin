import chalk from "chalk";
import type { CompactionEventLog, HarnessAttemptLog, InteractiveProviderConfig, KeepitmovinConfig } from "../config/types.js";
import { buildCompactionNudgeMessage, refreshHandoffFile, startHandoffWatcher } from "../handoff/refresh.js";
import type { NudgeTiming } from "../handoff/refresh.js";
import { startCompactionProbe, type CompactionProbeOptions } from "../probes/compaction.js";
import { buildAttemptLog } from "./attempt-log.js";
import {
  checkUsageThreshold,
  formatUsageProbeMessage,
  startUsageProbe,
  type ResolvedUsageProbe,
  type UsageProbeOptions,
  type UsageSnapshot
} from "../probes/usage.js";

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
  return buildAttemptLog(
    { provider, command: args.command, args: args.commandArgs, startedAt: args.startedAt },
    {
      exitCode: null,
      errorType: "rate_limit",
      errorDetail: detail,
      transcriptExcerpt: detail
    }
  );
};

export interface SessionWatcherContext {
  provider: InteractiveProviderConfig;
  config: KeepitmovinConfig;
  cwd: string;
  handoffPath: string;
  resolvedProbe: ResolvedUsageProbe | undefined;
  /** Test-only: overrides the fixed nudge pacing so tests need not wait minutes. */
  nudgeTiming?: NudgeTiming;
  usageProbeOptions?: UsageProbeOptions;
  transcriptLength: () => number;
  lastActivityAt: () => number;
  isSettled: () => boolean;
  writeToChild: (text: string) => void;
  onUsageLimit: (snapshot: UsageSnapshot) => void;
  onUsageSample?: (snapshot: UsageSnapshot) => void;
  startedAt: string;
  compactionProbeOptions?: CompactionProbeOptions;
  onCompaction: (event: CompactionEventLog) => void;
}

// Arms the usage-probe poller (when resolvedProbe is set) and the handoff
// watcher (when enabled). Returns a single stop() for cleanup.
export const armSessionWatchers = (ctx: SessionWatcherContext): (() => void) => {
  const stops: Array<() => void> = [];

  if (ctx.resolvedProbe) {
    stops.push(startUsageProbe(
      ctx.resolvedProbe,
      ctx.usageProbeOptions,
      ctx.onUsageLimit,
      ctx.onUsageSample
    ));
  }

  if (ctx.provider.compactionProbe) {
    stops.push(startCompactionProbe({
      provider: ctx.provider.name,
      spec: ctx.provider.compactionProbe,
      cwd: ctx.cwd,
      startedAt: ctx.startedAt,
      options: ctx.compactionProbeOptions,
      onCompaction: async (event) => {
        if (ctx.isSettled()) return;
        await refreshHandoffFile(ctx.cwd, ctx.config, ctx.handoffPath);
        ctx.writeToChild(buildCompactionNudgeMessage(ctx.handoffPath));
        ctx.onCompaction(event);
      }
    }));
  }

  stops.push(
    startHandoffWatcher({
      cwd: ctx.cwd,
      config: ctx.config,
      handoffPath: ctx.handoffPath,
      nudgeTiming: ctx.nudgeTiming,
      transcriptLength: ctx.transcriptLength,
      lastActivityAt: ctx.lastActivityAt,
      isSettled: ctx.isSettled,
      writeToChild: ctx.writeToChild
    })
  );

  return () => stops.forEach((stop) => stop());
};
