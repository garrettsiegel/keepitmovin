import chalk from "chalk";
import type {
  HarnessAttemptLog,
  HarnessSessionLog,
  InteractiveProviderConfig,
  CodePassConfig
} from "./types.js";
import { getChangedFiles } from "./git.js";
import {
  appendHandoffCheckpoint,
  archiveHandoffFile,
  buildProviderHandoffPrompt,
  buildSessionPrompt,
  createHandoffFile
} from "./handoff-file.js";
import { describeProviderChain, getEnabledInteractiveProviders } from "./interactive-provider.js";
import { waitForProvider } from "./harness-session.js";
import { defaultPtyFactory, type PtyFactory } from "./pty-factory.js";
import { writeSessionLog } from "./session-log.js";
import { chooseSwitchProvider, type SwitchSelector } from "./switch-menu.js";
import { renderCommercialBreak } from "./terminal-ui.js";
import type { UsageProbeOptions } from "./usage-probe.js";

export type { PtyFactory, PtyFactoryOptions, PtyProcess } from "./pty-factory.js";

export interface HarnessOptions {
  cwd: string;
  config: CodePassConfig;
  providers?: InteractiveProviderConfig[];
  ptyFactory?: PtyFactory;
  switchSelector?: SwitchSelector;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  // Test-only injection: points provider usage probes at a fixture directory.
  usageProbeOptions?: UsageProbeOptions;
}

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
      options.output,
      options.usageProbeOptions
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
      note: [
        attempt.errorDetail,
        selected
          ? "CodePass is switching tools. The next tool should read the handoff file first and continue from there."
          : "CodePass stopped because no next tool was selected or available."
      ]
        .filter(Boolean)
        .join(" ")
    });

    if (!selected) {
      finalProvider = provider.name;
      break;
    }

    options.output?.write(renderCommercialBreak(provider.label, selected.provider.label, attempt.errorType));
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
