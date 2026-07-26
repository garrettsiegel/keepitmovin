import chalk from "chalk";
import type {
  CompactionEventLog,
  InteractiveProviderConfig,
  KeepitmovinConfig,
  WatchdogEventLog
} from "../config/types.js";
import { createHandoffReceiptTracker } from "../handoff/receipt.js";
import { createWatchdogTracker } from "./watchdog.js";
import { startWatchdogProgressProbe } from "./watchdog-progress.js";
import type { UsageSnapshot } from "../probes/usage.js";

type ObserverOptions = {
  provider: InteractiveProviderConfig;
  config: KeepitmovinConfig;
  cwd: string;
  handoffPath: string;
  expectsReceipt: boolean;
  output?: NodeJS.WriteStream;
};

export const createHarnessObservers = (options: ObserverOptions) => {
  const { provider, config, cwd, handoffPath, output } = options;
  const compactionEvents: CompactionEventLog[] = [];
  const watchdogEvents: WatchdogEventLog[] = [];
  const watchdog = config.harness.watchdog.enabled
    ? createWatchdogTracker({ provider: provider.name })
    : undefined;

  const recordWatchdogEvents = (events: WatchdogEventLog[]): void => {
    for (const event of events) {
      watchdogEvents.push(event);
      output?.write(chalk.yellow(
        `\nkeepitmovin watchdog warning (${event.type}): ${event.detail} Continuing with ${provider.label}.\n`
      ));
    }
  };

  const receiptTracker = createHandoffReceiptTracker({
    expected: options.expectsReceipt,
    onReceipt: () => {
      watchdog?.observeProgress();
      output?.write(chalk.green(`\n${provider.label} confirmed it read the handoff.\n`));
    },
    onTimeout: () => {
      output?.write(chalk.yellow(
        `\nkeepitmovin did not receive a handoff receipt from ${provider.label} within 60 seconds. Continuing.\n`
      ));
    }
  });

  const stopProgressProbe = watchdog
    ? startWatchdogProgressProbe({ cwd, handoffPath, onProgress: () => watchdog.observeProgress() })
    : () => undefined;

  return {
    compactionEvents,
    watchdogEvents,
    receiptTracker,
    observeProgress: (): void => watchdog?.observeProgress(),
    observeOutput: (data: string): void => {
      if (watchdog) recordWatchdogEvents(watchdog.observeOutput(data));
    },
    observeUsage: (snapshot: UsageSnapshot): void => {
      if (watchdog) recordWatchdogEvents(watchdog.observeUsage(snapshot));
    },
    observeCompaction: (event: CompactionEventLog): void => {
      compactionEvents.push(event);
      watchdog?.observeProgress();
      output?.write(chalk.cyan(
        `\nkeepitmovin refreshed the handoff after ${provider.label} compacted its context.\n`
      ));
    },
    stop: (): void => {
      receiptTracker.stop();
      stopProgressProbe();
    }
  };
};
