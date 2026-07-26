import chalk from "chalk";
import { restoreTerminal } from "../terminal-restore.js";
import { cancel, isCancel, select } from "@clack/prompts";
import { loadConfig } from "../config.js";
import { runHarness } from "../harness.js";
import { describeProviderChain, getEnabledInteractiveProviders } from "../interactive-provider.js";
import { getSetupState, runSetupWizard } from "../setup.js";
import { resolveRouteForLaunch, resolveTaskForLaunch } from "../launch-routing.js";
import { renderHarnessStart } from "../terminal-ui.js";
import { assertConfigTrusted } from "../trust.js";
import { ensureProviderFreshness } from "../updates.js";
import type { CliOptions } from "../cli-options.js";
import type { KeepitmovinConfig } from "../types.js";

// On `kim`, decide which config to launch with. First run → wizard. Otherwise
// confirm the saved chain (reuse / reconfigure / start fresh). Non-interactive
// stdin reuses saved preferences without prompting.
const resolveLaunchConfig = async (
  loadedConfig: KeepitmovinConfig,
  cwd: string,
  configPath?: string
): Promise<KeepitmovinConfig> => {
  if (!loadedConfig.harness.setupComplete) {
    return (await runSetupWizard({ cwd, configPath })).config;
  }

  if (!process.stdin.isTTY) {
    return loadedConfig;
  }

  const enabled = getEnabledInteractiveProviders(loadedConfig);
  const chain = enabled.length > 0 ? describeProviderChain(enabled) : "(no tools turned on)";
  console.log(`${chalk.bold("Your fallback order:")} ${chain}`);

  const choice = await select({
    message: "Start with this order?",
    options: [
      { label: "Yes, start", value: "launch" },
      { label: "Change tools or order", value: "reconfigure" },
      { label: "Start over (ignore saved settings)", value: "fresh" }
    ],
    initialValue: "launch"
  });

  if (isCancel(choice)) {
    cancel("keepitmovin canceled.");
    throw new Error("keepitmovin canceled.");
  }

  if (choice === "launch") {
    return loadedConfig;
  }

  return (await runSetupWizard({
    cwd,
    configPath,
    force: true,
    reset: choice === "fresh"
  })).config;
};

export const runLaunchCommand = async (options: CliOptions): Promise<void> => {
  const cwd = options.cwd ?? process.cwd();

  try {
    const loaded = await loadConfig(cwd, options.config);
    // Gate untrusted config-defined commands before anything probes or spawns them.
    await assertConfigTrusted({
      config: loaded.config,
      configPath: loaded.path,
      interactive: Boolean(process.stdin.isTTY)
    });
    const config = await resolveLaunchConfig(loaded.config, cwd, options.config);
    const providers = getEnabledInteractiveProviders(config);
    const setupState = await getSetupState(cwd, options.config);
    const availabilityByName = new Map(
      setupState.toolStatuses.map((status) => [status.name, status.available])
    );
    const providersAvailableOnPath = providers.filter((provider) =>
      availabilityByName.get(provider.name) ?? false
    );
    const missingSelectedProviders = providers.filter((provider) =>
      !availabilityByName.get(provider.name)
    );

    for (const provider of missingSelectedProviders) {
      console.log(chalk.yellow(`${provider.label} isn't installed or isn't on your PATH — keepitmovin will skip it this session.`));
    }

    if (providersAvailableOnPath.length === 0) {
      throw new Error("None of your chosen tools are installed. Run `kim providers` to pick tools you have installed.");
    }

    const freshness = await ensureProviderFreshness({
      cwd,
      config,
      providers: providersAvailableOnPath,
      interactive: true
    });
    const missingProviders = new Set(
      freshness
        .filter((result) => result.action === "missing")
        .map((result) => result.provider)
    );
    const launchableProviders = providersAvailableOnPath.filter((provider) => !missingProviders.has(provider.name));

    if (launchableProviders.length === 0) {
      throw new Error("None of your chosen tools are installed. Run `kim providers` to pick tools you have installed.");
    }

    const task = await resolveTaskForLaunch(options, config);
    const routeDecision = await resolveRouteForLaunch(options, config, cwd, task);

    console.log(renderHarnessStart(launchableProviders));

    const summary = await runHarness({
      cwd,
      config,
      providers: launchableProviders,
      input: process.stdin,
      output: process.stdout,
      task,
      routeDecision,
      routeOverrides: routeDecision
        ? {
            model: options.model,
            effort: options.effort,
            targetProvider: launchableProviders[0]?.name
          }
        : undefined
    });

    if (summary.aborted) {
      process.exitCode = 130;
    }
  } catch (error) {
    // A throw from the harness tail (handoff/archive/session-log writes) can leave
    // the terminal in raw mode with a dead echo, so restore it before reporting.
    restoreTerminal();
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
