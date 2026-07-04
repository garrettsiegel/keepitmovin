import process from "node:process";
import chalk from "chalk";
import type { AgentErrorType, HarnessAttemptLog, InteractiveProviderConfig, CodePassConfig } from "./types.js";
import { detectExitFailure, detectLiveFailure, getManualSwitchSequence } from "./failure-detection.js";
import { renderInteractiveLaunch } from "./interactive-provider.js";
import type { PtyFactory, PtyProcess } from "./pty-factory.js";
import { RollingTranscript } from "./transcript.js";

// Runs a single provider in a PTY: mirrors stdin/stdout, watches live output for
// failures, and resolves with an attempt log once the tool exits or CodePass
// pauses it (manual switch, idle timeout, or a detected limit).
export const waitForProvider = async (
  provider: InteractiveProviderConfig,
  config: CodePassConfig,
  cwd: string,
  handoffPrompt: string | undefined,
  handoffPath: string,
  sessionPrompt: string,
  ptyFactory: PtyFactory,
  input: NodeJS.ReadStream | undefined,
  output: NodeJS.WriteStream | undefined
): Promise<HarnessAttemptLog> => {
  const launch = renderInteractiveLaunch(provider, {
    cwd,
    handoffPath,
    handoffPrompt,
    sessionPrompt
  });
  const transcript = new RollingTranscript(config.harness.transcriptLimitChars);
  const startedAt = new Date().toISOString();
  const manualSwitchSequence = getManualSwitchSequence(config);
  let detectedError: AgentErrorType | undefined;
  let settled = false;

  output?.write(chalk.cyan(`\nCodePass starting ${provider.label}...\n`));
  output?.write(chalk.gray(`Command: ${launch.command} ${launch.args.join(" ")}\n\n`));

  let child: PtyProcess;

  try {
    child = ptyFactory(launch.command, launch.args, {
      cwd,
      env: process.env
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    output?.write(chalk.yellow(`CodePass could not start ${provider.label}: ${message}\n`));

    return {
      provider: provider.name,
      label: provider.label,
      command: launch.command,
      args: launch.args,
      startedAt,
      endedAt: new Date().toISOString(),
      exitCode: 127,
      errorType: message.toLowerCase().includes("not found") || message.toLowerCase().includes("enoent")
        ? "command_not_found"
        : "unknown",
      transcriptExcerpt: message
    };
  }

  const ignoreTexts = [handoffPrompt, sessionPrompt];
  const idleTimeoutMs = config.harness.idleTimeoutMs;
  let idleTimer: NodeJS.Timeout | undefined;
  let cleaned = false;

  const triggerIdleTimeout = (): void => {
    if (settled) {
      return;
    }

    detectedError = "timeout";
    settled = true;
    output?.write(
      chalk.yellow(`\n\nCodePass saw no activity from ${provider.label} for ${idleTimeoutMs}ms. Pausing this tool...\n`)
    );
    child.kill();
  };

  const armIdleTimer = (): void => {
    if (idleTimeoutMs <= 0 || settled) {
      return;
    }

    if (idleTimer) {
      clearTimeout(idleTimer);
    }

    idleTimer = setTimeout(triggerIdleTimeout, idleTimeoutMs);
  };

  const onResize = (): void => {
    child.resize?.(process.stdout.columns || 80, process.stdout.rows || 24);
  };

  const onAbort = (): void => {
    cleanup();
    child.kill();
  };

  // Always-run teardown: restore the terminal and drop every listener so a
  // manual switch, timeout, normal exit, or Ctrl+C never leaves the shell in
  // raw mode.
  const cleanup = (): void => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    input?.off("data", onInput);
    input?.setRawMode?.(false);
    output?.off?.("resize", onResize);
    process.off("SIGINT", onAbort);
    process.off("SIGTERM", onAbort);
  };

  function onInput(chunk: Buffer): void {
    armIdleTimer();

    if (chunk.toString("utf8").includes(manualSwitchSequence)) {
      detectedError = "manual_switch";
      settled = true;
      output?.write(chalk.yellow("\n\nCodePass manual switch requested. Pausing this tool...\n"));
      child.kill();
      return;
    }

    child.write(chunk.toString());
  }

  input?.setRawMode?.(true);
  input?.resume();
  input?.on("data", onInput);
  output?.on?.("resize", onResize);
  process.once("SIGINT", onAbort);
  process.once("SIGTERM", onAbort);
  armIdleTimer();

  return new Promise((resolve) => {
    child.onData((data) => {
      transcript.append(data);
      output?.write(data);
      armIdleTimer();

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
            chalk.yellow(`\n\nCodePass noticed ${provider.label} appears blocked: ${detectedError}.\n`)
          );
          child.kill();
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
        transcriptExcerpt
      });
    });

    if (launch.bootstrapInput) {
      child.write(launch.bootstrapInput);
    }
  });
};
