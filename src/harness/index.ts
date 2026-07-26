import chalk from "chalk";
import type {
  AppliedRoute,
  HarnessAttemptLog,
  HarnessSessionLog,
  InteractiveProviderConfig,
  KeepitmovinConfig,
  RouteDecision
} from "../config/types.js";
import { getChangedFiles } from "../util/git.js";
import {
  appendHandoffCheckpoint,
  buildProviderHandoffPrompt,
  buildSessionPrompt,
  createHandoffFile
} from "../handoff/file.js";
import { getEnabledInteractiveProviders } from "../providers/interactive.js";
import { waitForProvider } from "./session.js";
import type { NudgeTiming } from "../handoff/refresh.js";
import { defaultPtyFactory, type PtyFactory } from "../pty/factory.js";
import { chooseSwitchProvider, type SwitchSelector } from "./switch-menu.js";
import { renderCommercialBreak } from "../ui/terminal.js";
import type { UsageProbeOptions } from "../probes/usage.js";
import type { CompactionProbeOptions } from "../probes/compaction.js";
import { classifyTask } from "../routing/classify.js";
import { resolveProviderRoute } from "../routing/model.js";
import type { RouteOverrides } from "../routing/model.js";
import { finalizeSession } from "./finalize.js";
export type { PtyFactory, PtyFactoryOptions, PtyProcess } from "../pty/factory.js";
export interface HarnessOptions {
  cwd: string;
  config: KeepitmovinConfig;
  providers?: InteractiveProviderConfig[];
  ptyFactory?: PtyFactory;
  switchSelector?: SwitchSelector;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  // Test-only injection: points provider usage probes at a fixture directory.
  usageProbeOptions?: UsageProbeOptions;
  compactionProbeOptions?: CompactionProbeOptions;
  /** Test-only: overrides the fixed stale-handoff nudge pacing. */
  nudgeTiming?: NudgeTiming;
  task?: string;
  routeDecision?: RouteDecision;
  routeOverrides?: RouteOverrides;
}
const meaningfulTranscriptExcerpt = (
  excerpt: string | undefined,
  transportPrompts: Array<string | undefined>
): string | undefined => {
  if (!excerpt) {
    return undefined;
  }

  const normalizeLines = (value: string): string =>
    value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const withoutPrompts = transportPrompts
    .filter((prompt): prompt is string => Boolean(prompt))
    .reduce((value, prompt) => value.replaceAll(normalizeLines(prompt), ""), normalizeLines(excerpt))
    .trim();
  return /^(?:received:\s*)?$/i.test(withoutPrompts) ? undefined : withoutPrompts;
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
  let aborted = false;
  let finalProvider: string | undefined;
  let repeatedFailures = 0;
  // Switching advances to whichever tool was chosen, with no memory of where it
  // has already been. With two tools the menu auto-picks the only other one, so a
  // persistent failure (both unauthenticated, or a bad detection) ping-ponged
  // A -> B -> A forever. Cap the total switches instead of trusting the chain.
  let switchCount = 0;
  const maxSwitches = providers.length * 2;

  if (providers.length === 0) {
    throw new Error("No tools are turned on. Run `kim setup` or `kim providers`.");
  }

  options.output?.write(chalk.gray("keepitmovin can't copy a tool's private chat history — the handoff file carries your context to the next tool.\n"));

  const handoffPath = await createHandoffFile(
    options.cwd,
    options.config,
    providers,
    startedAt,
    options.task
  );
  const sessionPrompt = buildSessionPrompt(handoffPath, providers, options.task);
  options.output?.write(chalk.gray(`Handoff file: ${handoffPath}\n`));

  let index = 0;
  while (index < providers.length) {
    const provider = providers[index];
    if (!provider) {
      index += 1;
      continue;
    }

    const decision = options.task && options.routeDecision?.source === "classifier"
      ? classifyTask({
          task: options.task,
          changedFiles: await getChangedFiles(options.cwd),
          repeatedFailures
        })
      : options.routeDecision;
    const route: AppliedRoute | undefined = decision
      ? await resolveProviderRoute(provider, decision, options.routeOverrides)
      : undefined;
    if (route) {
      options.output?.write(chalk.gray(
        `Route: ${route.tier} -> ${provider.label}` +
        `${route.model ? ` / ${route.model}` : " / tool default"}` +
        `${route.effort ? ` / ${route.effort}` : ""}\n`
      ));
    }

    const attempt = await waitForProvider(
      provider,
      options.config,
      options.cwd,
      handoffPrompt,
      handoffPath,
      sessionPrompt,
      route,
      options.ptyFactory ?? defaultPtyFactory,
      options.input,
      options.output,
      options.usageProbeOptions,
      options.compactionProbeOptions,
      options.nudgeTiming
    );
    attempts.push(
      attempt
    );

    if (["timeout", "nonzero_exit", "unknown"].includes(attempt.errorType ?? "")) {
      repeatedFailures += 1;
    }

    if (!attempt.errorType) {
      success = attempt.exitCode === 0;
      finalProvider = provider.name;
      break;
    }

    // Ctrl-C means the user wants out, not that this tool failed. Stop the whole
    // session rather than handing off to the next one.
    if (attempt.errorType === "aborted") {
      finalProvider = provider.name;
      aborted = true;
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
          ? "keepitmovin is switching tools. The next tool should read the handoff file first and continue from there."
          : "keepitmovin stopped because no next tool was selected or available."
      ]
        .filter(Boolean)
        .join(" ")
    });

    if (!selected) {
      finalProvider = provider.name;
      break;
    }

    switchCount += 1;
    if (switchCount > maxSwitches) {
      options.output?.write(
        chalk.yellow(
          `\nkeepitmovin switched tools ${maxSwitches} times without finishing, so it stopped to avoid looping.\n` +
            `Your handoff file is up to date at ${handoffPath}.\n`
        )
      );
      finalProvider = provider.name;
      break;
    }

    options.output?.write(renderCommercialBreak(provider.label, selected.provider.label, attempt.errorType));
    handoffPrompt = buildProviderHandoffPrompt(
      handoffPath,
      provider.label,
      selected.provider.label,
      attempt.errorType,
      options.task
    );
    options.output?.write(chalk.green(`Starting ${selected.provider.label} with your handoff file.\n`));
    index = selected.index;
  }
  return finalizeSession({
    cwd: options.cwd,
    config: options.config,
    input: options.input,
    output: options.output,
    task: options.task,
    routeDecision: options.routeDecision,
    startedAt,
    sessionId,
    handoffPath,
    sessionPrompt,
    handoffPrompt,
    providers,
    attempts,
    finalProvider,
    success,
    aborted,
    meaningfulTranscriptExcerpt
  });
};
