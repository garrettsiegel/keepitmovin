import process from "node:process";
import chalk from "chalk";
import { createBootstrapWriter } from "./bootstrap-input.js";
import type { AgentErrorType, AppliedRoute, HarnessAttemptLog, InteractiveProviderConfig, KeepitmovinConfig } from "./types.js";
import { detectExitFailure, detectLiveFailure, getManualSwitchSequence } from "./failure-detection.js";
import { renderInteractiveLaunch } from "./interactive-provider.js";
import type { PtyFactory } from "./pty-factory.js";
import { RollingTranscript } from "./transcript.js";
import { armSessionWatchers } from "./harness-watchers.js";
import { formatUsageProbeMessage, resolveUsageProbe, type UsageProbeOptions } from "./usage-probe.js";
import type { CompactionProbeOptions } from "./compaction-probe.js";
import { createHarnessObservers } from "./harness-observers.js";
import { startHarnessAttempt } from "./harness-attempt.js";
import { describeSwitchReason } from "./terminal-ui.js";

// Grace period between SIGTERM and SIGKILL for a child that ignores the former.
const KILL_ESCALATION_MS = 5_000;
/** Run one provider in a PTY until exit, manual switch, idle timeout, or limit. */
export const waitForProvider = async (
  provider: InteractiveProviderConfig,
  config: KeepitmovinConfig,
  cwd: string,
  handoffPrompt: string | undefined,
  handoffPath: string,
  sessionPrompt: string,
  route: AppliedRoute | undefined,
  ptyFactory: PtyFactory,
  input: NodeJS.ReadStream | undefined,
  output: NodeJS.WriteStream | undefined,
  usageProbeOptions?: UsageProbeOptions,
  compactionProbeOptions?: CompactionProbeOptions
): Promise<HarnessAttemptLog> => {
  const launch = renderInteractiveLaunch(provider, {
    cwd,
    handoffPath,
    handoffPrompt,
    sessionPrompt,
    route
  });
  const transcript = new RollingTranscript(config.harness.transcriptLimitChars);
  const startedAt = new Date().toISOString();
  const manualSwitchSequence = getManualSwitchSequence(config);
  let detectedError: AgentErrorType | undefined;
  let errorDetail: string | undefined;
  let settled = false;
  let lastActivityAt = Date.now();
  const resolvedProbe = resolveUsageProbe(provider, config);
  const start = await startHarnessAttempt({
    provider,
    launch,
    cwd,
    startedAt,
    route,
    expectsReceipt: Boolean(handoffPrompt),
    ptyFactory,
    resolvedProbe,
    usageProbeOptions,
    output
  });
  if ("attempt" in start) return start.attempt;
  const spawned = start.spawn();
  if ("attempt" in spawned) return spawned.attempt;
  const child = spawned.child;
  const observers = createHarnessObservers({
    provider,
    config,
    cwd,
    handoffPath,
    expectsReceipt: Boolean(handoffPrompt),
    output
  });

  // Paste-transport tools echo the bootstrap text back, so it has to be stripped
  // alongside the argv-delivered prompts before the transcript is scanned.
  const ignoreTexts = [handoffPrompt, sessionPrompt, launch.bootstrapInput];
  const idleTimeoutMs = config.harness.idleTimeoutMs;
  let idleTimer: NodeJS.Timeout | undefined;
  let cleaned = false;

  const triggerIdleTimeout = (): void => {
    if (settled) return;
    detectedError = "timeout";
    settled = true;
    output?.write(
      chalk.yellow(`\n\nkeepitmovin saw no activity from ${provider.label} for ${idleTimeoutMs}ms. Pausing this tool...\n`)
    );
    killChild();
  };

  const armIdleTimer = (): void => {
    if (idleTimeoutMs <= 0 || settled) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(triggerIdleTimeout, idleTimeoutMs);
  };

  const stopWatchers = armSessionWatchers({
    provider,
    config,
    cwd,
    handoffPath,
    resolvedProbe,
    usageProbeOptions,
    transcriptLength: () => transcript.text().length,
    lastActivityAt: () => lastActivityAt,
    isSettled: () => settled,
    writeToChild: (text) => child.write(text),
    onUsageLimit: (snapshot) => {
      if (settled || !resolvedProbe) {
        return;
      }

      detectedError = "rate_limit";
      errorDetail = formatUsageProbeMessage(provider.label, snapshot, resolvedProbe.thresholdPercent);
      settled = true;
      output?.write(chalk.yellow(`\n\n${errorDetail} Pausing this tool...\n`));
      killChild();
    },
    onUsageSample: observers.observeUsage,
    startedAt,
    compactionProbeOptions,
    onCompaction: observers.observeCompaction
  });

  // node-pty throws if the pty is already gone, and `output` may be an injected
  // stream rather than process.stdout.
  const onResize = (): void => {
    try {
      child.resize?.(output?.columns || process.stdout.columns || 80, output?.rows || process.stdout.rows || 24);
    } catch {
      // The child exited between the resize event and this call — nothing to do.
    }
  };

  // A tool that traps SIGTERM to run its own shutdown prompt may never exit, which
  // would leave the attempt promise pending forever and wedge keepitmovin. Escalate.
  let killEscalation: NodeJS.Timeout | undefined;
  const killChild = (): void => {
    child.kill();
    if (killEscalation) clearTimeout(killEscalation);
    killEscalation = setTimeout(() => child.kill("SIGKILL"), KILL_ESCALATION_MS);
    killEscalation.unref?.();
  };

  // Ctrl-C / SIGTERM. Registering a listener suppresses Node's default
  // termination, so without recording the abort the child's kill read back as a
  // clean exit and keepitmovin went on to write checkpoints and a "success"
  // session log instead of stopping.
  const onAbort = (): void => {
    if (!settled) {
      settled = true;
      detectedError = "aborted";
    }
    cleanup();
    killChild();
  };

  let bootstrap: ReturnType<typeof createBootstrapWriter> | undefined;
  // Keystrokes mirrored to the child before the (deferred) bootstrap paste lands
  // are held here, then flushed once the paste is written — otherwise early user
  // input interleaves with and corrupts the pasted prompt.
  const pendingChildInput: string[] = [];

  const flushPendingInput = (): void => {
    if (pendingChildInput.length === 0) return;
    child.write(pendingChildInput.splice(0).join(""));
  };

  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    if (idleTimer) clearTimeout(idleTimer);
    if (killEscalation) clearTimeout(killEscalation);
    bootstrap?.cancel();
    observers.stop();
    stopWatchers();
    input?.off("data", onInput);
    input?.setRawMode?.(false);
    // stdin was resumed to mirror keystrokes; leaving it flowing and ref'd keeps
    // the event loop alive, so `kim` would hang instead of exiting.
    if (resumedInput) input?.pause();
    output?.off?.("resize", onResize);
    process.off("SIGINT", onAbort);
    process.off("SIGTERM", onAbort);
  };

  function onInput(chunk: Buffer): void {
    lastActivityAt = Date.now();
    observers.observeProgress();
    armIdleTimer();

    if (chunk.toString("utf8").includes(manualSwitchSequence)) {
      detectedError = "manual_switch";
      settled = true;
      output?.write(chalk.yellow("\n\nkeepitmovin manual switch requested. Pausing this tool...\n"));
      killChild();
      return;
    }

    if (bootstrap && !bootstrap.isWritten()) {
      pendingChildInput.push(chunk.toString());
      return;
    }

    child.write(chunk.toString());
  }

  const resumedInput = input !== undefined && input.isPaused?.() !== false;
  input?.setRawMode?.(true);
  if (resumedInput) input?.resume();
  input?.on("data", onInput);
  output?.on?.("resize", onResize);
  process.once("SIGINT", onAbort);
  process.once("SIGTERM", onAbort);
  armIdleTimer();

  return new Promise((resolve) => {
    bootstrap = createBootstrapWriter(child, launch.bootstrapInput, {
      isSettled: () => settled,
      onWritten: () => {
        lastActivityAt = Date.now();
        armIdleTimer();
        flushPendingInput();
      }
    });

    child.onData((data) => {
      lastActivityAt = Date.now();
      transcript.append(data);
      observers.receiptTracker.append(data);
      observers.observeOutput(data);
      output?.write(data);
      armIdleTimer();
      bootstrap?.onChildData();

      if (!detectedError) {
        detectedError = detectLiveFailure(
          transcript.excerpt(),
          provider,
          config,
          ignoreTexts
        );
        if (detectedError && !settled) {
          settled = true;
          output?.write(
            chalk.yellow(`\n\n${provider.label} looks blocked (${describeSwitchReason(detectedError)}).\n`)
          );
          killChild();
        }
      }
    });

    child.onExit((event) => {
      cleanup();
      const transcriptExcerpt = transcript.excerpt();
      const errorType =
        detectedError ??
        (event.exitCode === 0
          ? detectLiveFailure(transcript.text(), provider, config, ignoreTexts)
          : detectExitFailure(
              transcript.text(),
              provider,
              config,
              event.exitCode,
              ignoreTexts
            ));

      resolve({
        provider: provider.name,
        label: provider.label,
        command: launch.command,
        args: launch.args,
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: event.exitCode,
        errorType,
        errorDetail,
        transcriptExcerpt,
        handoffReceipt: observers.receiptTracker.snapshot(),
        ...(observers.compactionEvents.length > 0 ? { compactionEvents: observers.compactionEvents } : {}),
        ...(observers.watchdogEvents.length > 0 ? { watchdogEvents: observers.watchdogEvents } : {}),
        ...(route ? { route } : {})
      });
    });

    bootstrap.arm();
  });
};
