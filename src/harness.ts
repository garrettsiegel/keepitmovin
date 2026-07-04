import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import process from "node:process";
import * as nodePty from "node-pty";
import chalk from "chalk";
import type {
  AgentErrorType,
  HarnessAttemptLog,
  HarnessSessionLog,
  InteractiveProviderConfig,
  CodePassConfig
} from "./types.js";
import { classifyError, matchLimitPattern } from "./errors.js";
import { getChangedFiles } from "./git.js";
import {
  appendHandoffCheckpoint,
  archiveHandoffFile,
  buildProviderHandoffPrompt,
  buildSessionPrompt,
  createHandoffFile
} from "./handoff-file.js";
import {
  describeProviderChain,
  getEnabledInteractiveProviders,
  renderInteractiveLaunch
} from "./interactive-provider.js";
import { ensurePtyHelperExecutable } from "./pty-helper.js";
import { writeSessionLog } from "./session-log.js";
import { chooseSwitchProvider, type SwitchSelector } from "./switch-menu.js";
import { RollingTranscript } from "./transcript.js";

export interface PtyProcess {
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  kill(signal?: string): void;
  resize?(cols: number, rows: number): void;
}

export interface PtyFactoryOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type PtyFactory = (
  command: string,
  args: string[],
  options: PtyFactoryOptions
) => PtyProcess;

export interface HarnessOptions {
  cwd: string;
  config: CodePassConfig;
  providers?: InteractiveProviderConfig[];
  ptyFactory?: PtyFactory;
  switchSelector?: SwitchSelector;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

class ChildProcessPtyAdapter implements PtyProcess {
  readonly #child: ChildProcessWithoutNullStreams;
  #exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  #exited = false;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.#child = child;
    this.#child.on("exit", (exitCode) => {
      this.#emitExit(exitCode ?? 1);
    });
    this.#child.on("error", () => {
      this.#emitExit(127);
    });
  }

  onData(listener: (data: string) => void): void {
    this.#child.stdout.on("data", (data: Buffer) => listener(data.toString("utf8")));
    this.#child.stderr.on("data", (data: Buffer) => listener(data.toString("utf8")));
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.#exitListeners.push(listener);
  }

  write(data: string): void {
    this.#child.stdin.write(data);
  }

  kill(signal?: string): void {
    this.#child.kill(signal as NodeJS.Signals | undefined);
  }

  // No-op: a piped child process has no TTY to resize. Kept so the pipe
  // fallback still satisfies the PtyProcess contract.
  resize(): void {}

  #emitExit(exitCode: number): void {
    if (this.#exited) {
      return;
    }

    this.#exited = true;
    this.#exitListeners.forEach((listener) => listener({ exitCode }));
  }
}

const nodePtyFactory: PtyFactory = (command, args, options) => {
  // Self-heal node-pty's spawn-helper exec bit before the first spawn so pnpm
  // installs don't silently drop us to non-interactive pipes.
  ensurePtyHelperExecutable();

  return nodePty.spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    name: "xterm-256color",
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24
  });
};

const pipeFallbackPtyFactory: PtyFactory = (command, args, options) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "pipe"
  });

  return new ChildProcessPtyAdapter(child);
};

let warnedPtyFallback = false;

const defaultPtyFactory: PtyFactory = (command, args, options) => {
  try {
    return nodePtyFactory(command, args, options);
  } catch (error) {
    if (!warnedPtyFallback) {
      warnedPtyFallback = true;
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        chalk.yellow(
          `\nCodePass could not start a real terminal (node-pty: ${detail}).\n` +
            "Falling back to non-interactive pipes — interactive tools like Claude Code may hang.\n" +
            "Fix: reinstall dependencies, or make node-pty's prebuilt spawn-helper executable.\n\n"
        )
      );
    }

    return pipeFallbackPtyFactory(command, args, options);
  }
};

// Control sequences for the supported manual-switch keys. Values are the raw
// bytes a terminal emits for each chord.
const MANUAL_SWITCH_SEQUENCES: Record<string, string> = {
  "ctrl-]": "\x1d",
  "ctrl-\\": "\x1c",
  "ctrl-g": "\x07",
  "ctrl-o": "\x0f"
};

const getManualSwitchSequence = (config: CodePassConfig): string =>
  MANUAL_SWITCH_SEQUENCES[config.harness.manualSwitchKey.toLowerCase()] ?? "\x1d";

// Prefixes that mark a line as a tool/status/error line rather than the agent's
// prose. A limit pattern is only trusted live when it heads its line or the line
// starts with one of these.
const ERROR_LINE_INDICATORS = [
  "error",
  "err:",
  "fatal",
  "failed",
  "request failed",
  "api error",
  "http error",
  "status:",
  "warn:",
  "warning:",
  "✗",
  "×",
  "⚠",
  "⛔",
  "🚫",
  "❌",
  "⏳",
  "❗",
  "‼",
  "[error]",
  "[warn]",
  "[warning]"
];

// Words that signal a definitive status event (not prose discussion) when they
// appear in the same line as a limit pattern. Handles tool-generated messages
// like "Claude usage limit reached." that lack a technical error prefix.
const STATUS_WORDS = [
  "reached",
  "exceeded",
  "exceed",
  "encountered",
  "triggered",
  "detected",
  "hit"
];

const stripIgnored = (text: string, ignore: Array<string | undefined>): string =>
  ignore
    .filter((value): value is string => Boolean(value))
    .reduce((accumulated, value) => accumulated.replaceAll(value, ""), text);

// True when `line` contains `pattern` in a way that reads like a status/error
// line — either the line leads with the pattern itself, or with a known error
// indicator. This is what stops CodePass from switching when an agent merely
// *mentions* a rate limit in ordinary prose.
const isStatusLikeLine = (line: string, pattern: string): boolean => {
  const trimmed = line.trim().toLowerCase();

  if (!trimmed.includes(pattern)) {
    return false;
  }

  if (trimmed.startsWith(pattern)) {
    return true;
  }

  if (ERROR_LINE_INDICATORS.some((indicator) => trimmed.startsWith(indicator))) {
    return true;
  }

  const withoutPrefix = trimmed.replace(/^[[(][^\])]*[\])]\s*/, "");
  if (withoutPrefix !== trimmed) {
    if (
      withoutPrefix.startsWith(pattern) ||
      ERROR_LINE_INDICATORS.some((indicator) => withoutPrefix.startsWith(indicator))
    ) {
      return true;
    }
  }

  // A line with a limit pattern AND a status word (e.g. "usage limit reached")
  // is a definitive status event, not prose discussion.
  if (STATUS_WORDS.some((word) => trimmed.includes(word))) {
    return true;
  }

  return false;
};

// Live (still-running) detection. Scoped to the transcript tail with the prompts
// stripped, and only trusts a limit pattern that appears on a status-like line.
const detectLiveFailure = (
  tail: string,
  provider: InteractiveProviderConfig,
  config: CodePassConfig,
  ignore: Array<string | undefined>
): AgentErrorType | undefined => {
  const cleaned = stripIgnored(tail, ignore);
  const fallbackOn = provider.fallbackOn ?? config.fallbackOn;

  for (const line of cleaned.split("\n")) {
    const match = matchLimitPattern(line);
    if (!match || !fallbackOn.includes(match.type)) {
      continue;
    }

    if (isStatusLikeLine(line, match.pattern)) {
      return match.type;
    }
  }

  return undefined;
};

// Post-exit detection. A non-zero exit is already a strong failure signal, so
// this uses the broader classifier on the stripped tail.
const detectExitFailure = (
  tail: string,
  provider: InteractiveProviderConfig,
  config: CodePassConfig,
  exitCode: number | null,
  ignore: Array<string | undefined>
): AgentErrorType | undefined => {
  const detected = classifyError(stripIgnored(tail, ignore), "", exitCode ?? 1);
  const fallbackOn = provider.fallbackOn ?? config.fallbackOn;

  return detected && fallbackOn.includes(detected) ? detected : undefined;
};

const waitForProvider = async (
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

export const runHarness = async (
  options: HarnessOptions
): Promise<HarnessSessionLog> => {
  const providers = options.providers ?? getEnabledInteractiveProviders(options.config);
  const startedAt = new Date().toISOString();
  const sessionId = startedAt.replaceAll(":", "-").replaceAll(".", "-");
  const attempts: HarnessAttemptLog[] = [];
  let handoffPrompt: string | undefined;
  let success = false;
  let finalProvider: string | undefined;

  if (providers.length === 0) {
    throw new Error("CodePass harness has no enabled providers. Run `codepass setup` or `codepass providers`.");
  }

  options.output?.write(chalk.bold("CodePass harness\n"));
  options.output?.write(`Provider chain: ${describeProviderChain(providers)}\n`);
  options.output?.write(chalk.gray("CodePass cannot transfer private provider chat state. The handoff file is the shared continuity layer.\n"));
  options.output?.write(chalk.gray(`Manual switch: press ${options.config.harness.manualSwitchKey} any time CodePass is running a tool.\n`));

  const handoffPath = await createHandoffFile(
    options.cwd,
    options.config,
    providers,
    startedAt
  );
  const sessionPrompt = buildSessionPrompt(handoffPath, providers);
  options.output?.write(chalk.gray(`Handoff file: ${handoffPath}\n`));

  let index = 0;
  while (index < providers.length) {
    const provider = providers[index];
    if (!provider) {
      index += 1;
      continue;
    }

    const attempt = await waitForProvider(
      provider,
      options.config,
      options.cwd,
      handoffPrompt,
      handoffPath,
      sessionPrompt,
      options.ptyFactory ?? defaultPtyFactory,
      options.input,
      options.output
    );
    attempts.push(attempt);

    if (!attempt.errorType) {
      success = attempt.exitCode === 0;
      finalProvider = provider.name;
      break;
    }

    const choices = providers
      .map((candidate, candidateIndex) => ({ provider: candidate, index: candidateIndex }))
      .filter((choice) => choice.index !== index);
    const selected = await (options.switchSelector ?? chooseSwitchProvider)(
      choices,
      attempt.errorType
    );

    await appendHandoffCheckpoint(options.cwd, options.config, {
      type: "tool_switch",
      fromProvider: provider.label,
      toProvider: selected?.provider.label,
      reason: attempt.errorType,
      transcriptExcerpt: attempt.transcriptExcerpt,
      note: selected
        ? "CodePass is switching tools. The next tool should read the handoff file first and continue from there."
        : "CodePass stopped because no next tool was selected or available."
    });

    if (!selected) {
      finalProvider = provider.name;
      break;
    }

    options.output?.write(chalk.yellow(`\nCodePass commercial break: switching from ${provider.label} to ${selected.provider.label}...\n`));
    handoffPrompt = buildProviderHandoffPrompt(
      handoffPath,
      provider.label,
      selected.provider.label,
      attempt.errorType
    );
    options.output?.write(chalk.green(`Starting ${selected.provider.label} with the CodePass handoff file.\n`));
    index = selected.index;
  }

  await appendHandoffCheckpoint(options.cwd, options.config, {
    type: "session_end",
    fromProvider: finalProvider,
    note: success ? "CodePass session ended successfully." : "CodePass session ended before a successful provider completion."
  });
  const archivePath = await archiveHandoffFile(options.cwd, options.config, sessionId);
  if (archivePath) {
    options.output?.write(chalk.gray(`CodePass archived handoff: ${archivePath}\n`));
  }

  const log: HarnessSessionLog = {
    cwd: options.cwd,
    startedAt,
    endedAt: new Date().toISOString(),
    providerOrder: providers.map((provider) => provider.name),
    attempts,
    finalProvider,
    success,
    changedFiles: await getChangedFiles(options.cwd)
  };
  const sessionLogPath = await writeSessionLog(options.cwd, options.config, log);
  options.output?.write(chalk.gray(`\nCodePass session log: ${sessionLogPath}\n`));

  return { ...log, sessionLogPath };
};
