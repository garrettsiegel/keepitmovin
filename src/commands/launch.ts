import chalk from "chalk";
import { restoreTerminal } from "../ui/restore.js";
import { loadConfig } from "../config/index.js";
import { runHarness } from "../harness/index.js";
import { describeProviderChain, getEnabledInteractiveProviders } from "../providers/interactive.js";
import { getSetupState, runSetupWizard } from "../setup/index.js";
import { resolveRouteForLaunch, resolveTaskForLaunch } from "../routing/launch.js";
import { renderHarnessStart } from "../ui/terminal.js";
import { assertConfigTrusted } from "../config/trust.js";
import { ensureProviderFreshness } from "../setup/updates.js";
import type { CliOptions } from "../cli-options.js";
import type { KeepitmovinConfig } from "../config/types.js";

// On `kim`, decide which config to launch with. First run → wizard. Otherwise
// launch straight into the saved chain — `kim providers` is how you change it.
const resolveLaunchConfig = async (
  loadedConfig: KeepitmovinConfig,
  cwd: string,
  configPath?: string
): Promise<KeepitmovinConfig> => {
  if (!loadedConfig.harness.setupComplete) {
    return (await runSetupWizard({ cwd, configPath })).config;
  }

  const enabled = getEnabledInteractiveProviders(loadedConfig);
  const chain = enabled.length > 0 ? describeProviderChain(enabled) : "(no tools turned on)";
  console.log(`${chalk.bold("Your fallback order:")} ${chain} ${chalk.gray("(change it with `kim providers`)")}`);

  return loadedConfig;
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
