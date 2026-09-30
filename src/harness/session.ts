import chalk from "chalk";
import { createBootstrapWriter } from "./bootstrap-input.js";
import { DEFAULT_TRANSCRIPT_LIMIT_CHARS } from "../config/config-schema.js";
import type { AgentErrorType, AppliedRoute, HarnessAttemptLog, InteractiveProviderConfig, KeepitmovinConfig } from "../config/types.js";
import { detectExitFailure, detectLiveFailure, getManualSwitchSequence } from "../detection/failure-detection.js";
import { renderInteractiveLaunch } from "../providers/interactive.js";
import { RollingTranscript } from "./transcript.js";
import { armSessionWatchers } from "./watchers.js";
import { formatUsageProbeMessage, resolveUsageProbe } from "../probes/usage.js";
import { createHarnessObservers } from "./observers.js";
import { startHarnessAttempt } from "./attempt.js";
import { describeSwitchReason } from "../ui/terminal.js";
import { attachSessionIo } from "./io.js";
import { buildAttemptLog } from "./attempt-log.js";
import { createEscalatingKill } from "../pty/factory.js";
/** Run one provider in a PTY until exit, manual switch, idle timeout, or limit. */
export const waitForProvider = async (
  provider: InteractiveProviderConfig,
  config: KeepitmovinConfig,
  cwd: string,
  handoffPrompt: string | undefined,
  handoffPath: string,
  sessionPrompt: string,
  route: AppliedRoute | undefined,
  input: NodeJS.ReadStream | undefined,
  output: NodeJS.WriteStream | undefined
): Promise<HarnessAttemptLog> => {
  const launch = renderInteractiveLaunch(provider, {
    cwd,
    handoffPath,
    handoffPrompt,
    sessionPrompt,
    route
  });
  const transcript = new RollingTranscript(DEFAULT_TRANSCRIPT_LIMIT_CHARS);
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
    resolvedProbe,
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

  const { kill: killChild, cancel: cancelKillEscalation } = createEscalatingKill(child);

  // Every switch trigger funnels through here so the settle-then-kill order is
  // written once. Returns false when another trigger already won.
  const settle = (errorType: AgentErrorType, message: string): boolean => {
    if (settled) return false;
    settled = true;
    detectedError = errorType;
    output?.write(chalk.yellow(`\n\n${message}\n`));
    killChild();
    return true;
  };

  const triggerIdleTimeout = (): void => {
    settle("timeout", `keepitmovin saw no activity from ${provider.label} for ${idleTimeoutMs}ms. Pausing this tool...`);
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
    transcriptLength: () => transcript.text().length,
    lastActivityAt: () => lastActivityAt,
    isSettled: () => settled,
    writeToChild: (text) => child.write(text),
    onUsageLimit: (snapshot) => {
      if (settled || !resolvedProbe) return;
      errorDetail = formatUsageProbeMessage(provider.label, snapshot, resolvedProbe.thresholdPercent);
      settle("rate_limit", `${errorDetail} Pausing this tool...`);
    },
    onUsageSample: observers.observeUsage,
    startedAt,
    onCompaction: observers.observeCompaction
  });

  let bootstrap: ReturnType<typeof createBootstrapWriter> | undefined;

  const io = attachSessionIo({
    input,
    output,
    manualSwitchSequence,
    onActivity: () => {
      lastActivityAt = Date.now();
      observers.observeProgress();
      armIdleTimer();
    },
    onManualSwitch: () => {
      settle("manual_switch", "keepitmovin manual switch requested. Pausing this tool...");
    },
    // Registering a SIGINT listener suppresses Node's default termination, so
    // without recording the abort the child's kill read back as a clean exit and
    // keepitmovin went on to write checkpoints and a "success" session log.
    onAbort: () => {
      if (!settled) {
        settled = true;
        detectedError = "aborted";
      }
      // Kill before cleanup: cleanup cancels the SIGKILL escalation, so the
      // reverse order left a live timer behind.
      killChild();
      cleanup();
    },
    writeToChild: (data) => child.write(data),
    resizeChild: (cols, rows) => child.resize?.(cols, rows),
    isBootstrapPending: () => Boolean(bootstrap && !bootstrap.isWritten())
  });

  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    if (idleTimer) clearTimeout(idleTimer);
    cancelKillEscalation();
    bootstrap?.cancel();
    observers.stop();
    stopWatchers();
    io.detach();
  };

  armIdleTimer();

  return new Promise((resolve) => {
    bootstrap = createBootstrapWriter(child, launch.bootstrapInput, {
      isSettled: () => settled,
      onWritten: () => {
        lastActivityAt = Date.now();
        armIdleTimer();
        io.flushPendingInput();
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
        const liveError = detectLiveFailure(transcript.excerpt(), provider, ignoreTexts);
        if (liveError) settle(liveError, `${provider.label} looks blocked (${describeSwitchReason(liveError)}).`);
      }
    });

    child.onExit((event) => {
      cleanup();
      const transcriptExcerpt = transcript.excerpt();
      // Deliberately scans the FULL transcript on a clean exit, not just the
      // tail: tools commonly print the limit banner and then exit 0, and by then
      // the banner can have scrolled well past the excerpt window.
      const errorType =
        detectedError ??
        (event.exitCode === 0
          ? detectLiveFailure(transcript.text(), provider, ignoreTexts)
          : detectExitFailure(transcript.text(), transcriptExcerpt, provider, event.exitCode, ignoreTexts));

      resolve(
        buildAttemptLog(
          { provider, command: launch.command, args: launch.args, startedAt, route },
          {
            exitCode: event.exitCode,
            errorType,
            errorDetail,
            transcriptExcerpt,
            handoffReceipt: observers.receiptTracker.snapshot(),
            ...(observers.compactionEvents.length > 0
              ? { compactionEvents: observers.compactionEvents }
              : {}),
            ...(observers.watchdogEvents.length > 0
              ? { watchdogEvents: observers.watchdogEvents }
              : {})
          }
        )
      );
    });

    bootstrap.arm();
  });
};
