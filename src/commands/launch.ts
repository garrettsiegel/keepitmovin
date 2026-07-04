import chalk from "chalk";
import { cancel, isCancel, select } from "@clack/prompts";
import { loadConfig } from "../config.js";
import { runHarness } from "../harness.js";
import { describeProviderChain, getEnabledInteractiveProviders } from "../interactive-provider.js";
import { getSetupState, runSetupWizard } from "../setup.js";
import { renderHarnessStart } from "../terminal-ui.js";
import { ensureProviderFreshness } from "../updates.js";
import type { CliOptions } from "../cli-options.js";
import type { CodePassConfig } from "../types.js";

// On `codepass`, decide which config to launch with. First run → wizard. Otherwise
// confirm the saved chain (reuse / reconfigure / start fresh). Non-interactive
// stdin reuses saved preferences without prompting.
const resolveLaunchConfig = async (
  loadedConfig: CodePassConfig,
  cwd: string,
  configPath?: string
): Promise<CodePassConfig> => {
  if (!loadedConfig.harness.setupComplete) {
    return (await runSetupWizard({ cwd, configPath })).config;
  }

  if (!process.stdin.isTTY) {
    return loadedConfig;
  }

  const enabled = getEnabledInteractiveProviders(loadedConfig);
  const chain = enabled.length > 0 ? describeProviderChain(enabled) : "(no enabled tools)";
  console.log(`${chalk.bold("Saved chain:")} ${chain}`);

  const choice = await select({
    message: "Start with this chain?",
    options: [
      { label: "Yes, launch", value: "launch" },
      { label: "Reconfigure (choose tools/order)", value: "reconfigure" },
      { label: "Start fresh (ignore saved preferences)", value: "fresh" }
    ],
    initialValue: "launch"
  });

  if (isCancel(choice)) {
    cancel("CodePass canceled.");
    throw new Error("CodePass canceled.");
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
      console.log(chalk.yellow(`${provider.label} is not installed or not on PATH. CodePass will skip it for this session.`));
    }

    if (providersAvailableOnPath.length === 0) {
      throw new Error("CodePass did not find any launchable tools in your selected stack. Run `codepass providers` to choose installed tools.");
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
      throw new Error("CodePass did not find any launchable tools in your selected stack. Run `codepass providers` to choose installed tools.");
    }

    console.log(renderHarnessStart(launchableProviders));

    await runHarness({
      cwd,
      config,
      providers: launchableProviders,
      input: process.stdin,
      output: process.stdout
    });
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
