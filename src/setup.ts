import {
  box,
  confirm,
  groupMultiselect,
  intro,
  log,
  note,
  outro
} from "@clack/prompts";
import chalk from "chalk";
import { defaultConfig, saveConfig } from "./config.js";
import { isHarnessControllable } from "./provider-catalog.js";
import { buildStackOptions, chooseProviderOrder, renderCatalogPreview, unwrapPrompt } from "./setup-prompts.js";
import { renderProviderOrderSummary } from "./terminal-ui.js";
import { getSetupState } from "./tool-status.js";
import type { InteractiveProviderConfig, CodePassConfig } from "./types.js";

export { getSetupState, type ToolStatus } from "./tool-status.js";

export interface SetupOptions {
  cwd: string;
  configPath?: string;
  force?: boolean;
  showAllCatalog?: boolean;
  /** Start the wizard from built-in defaults instead of the saved config. */
  reset?: boolean;
}

export const applyProviderOrder = (
  config: CodePassConfig,
  providerOrder: string[]
): CodePassConfig => ({
  ...config,
  harness: {
    ...config.harness,
    setupComplete: true,
    providerOrder,
    providers: config.harness.providers.map((provider) => ({
      ...provider,
      enabled: isHarnessControllable(provider) && providerOrder.includes(provider.name)
    }))
  }
});

export const runSetupWizard = async (
  options: SetupOptions
): Promise<{ config: CodePassConfig; configPath: string }> => {
  const state = await getSetupState(options.cwd, options.configPath);
  const startingConfig = options.reset || !state.exists ? defaultConfig() : state.config;

  const selectableProviderCount = startingConfig.harness.providers.filter((provider: InteractiveProviderConfig) => {
    const status = state.toolStatuses.find((entry) => entry.name === provider.name);
    return isHarnessControllable(provider) && status?.available;
  }).length;

  if (selectableProviderCount === 0) {
    throw new Error("CodePass did not find any installed terminal coding tools yet. Install one from the Add Later list, then run `codepass` again.");
  }

  intro(chalk.bgCyan.black(" CodePass "));
  box(
    [
      "CodePass starts your coding tool inside one terminal harness.",
      "If that tool hits a limit, CodePass helps the next tool continue with the shared handoff file."
    ].join("\n"),
    "Overview",
    {
      rounded: true
    }
  );
  note(
    [
      "1. Choose the tools you want in your stack.",
      "2. CodePass starts the first one for you.",
      "3. If limits or failures appear, CodePass switches tools with .codepass/current/handoff.md."
    ].join("\n"),
    "How it works"
  );

  if (startingConfig.updates.checkOnStart) {
    note(
      startingConfig.updates.mode === "always"
        ? "CodePass checks selected tools on each start and runs their native updater when one is verified."
        : "CodePass checks selected tools on each start and asks before running verified updater commands.",
      "Tool updates"
    );
  }

  if (options.showAllCatalog) {
    note(renderCatalogPreview(state.catalogStatuses), "Popular guided tools");
  }

  const stackOptions = buildStackOptions(startingConfig.harness.providers, state.toolStatuses);
  const initialValues = startingConfig.harness.providers
    .filter((provider: InteractiveProviderConfig) =>
      provider.enabled &&
      state.toolStatuses.some((status) => status.name === provider.name && status.available)
    )
    .map((provider: InteractiveProviderConfig) => provider.name);

  const selectedProviders = unwrapPrompt(await groupMultiselect<string>({
    message: "Choose your stack",
    options: stackOptions,
    initialValues,
    required: true,
    selectableGroups: false,
    groupSpacing: 1,
    maxItems: 12
  })).filter((name) =>
    state.toolStatuses.some((status) => status.name === name && status.available)
  );

  if (selectedProviders.length === 0) {
    throw new Error("Choose at least one installed tool for your CodePass stack.");
  }

  const providerOrder = await chooseProviderOrder(
    selectedProviders,
    startingConfig.harness.providers
  );
  const chainSummary = renderProviderOrderSummary(
    startingConfig.harness.providers,
    providerOrder
  );
  note(chainSummary, "Selected stack");

  const wantsOpenRouter = selectedProviders.includes("cline")
    ? unwrapPrompt(await confirm({
        message: "Do you plan to use Cline with OpenRouter models like DeepSeek?",
        initialValue: true
      }))
    : false;

  if (wantsOpenRouter) {
    log.info("CodePass will keep Cline configurable. Add OpenRouter-specific Cline flags once the Cline CLI is installed and verified.");
  }

  const config = applyProviderOrder(startingConfig, providerOrder);
  const configPath = await saveConfig(options.cwd, config, options.configPath);
  outro(`CodePass setup saved: ${configPath}`);

  return { config, configPath };
};
