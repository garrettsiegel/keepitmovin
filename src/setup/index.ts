import { confirm, groupMultiselect, intro, log, note, outro } from "@clack/prompts";
import process from "node:process";
import chalk from "chalk";
import { defaultConfig, loadConfig, saveConfig } from "../config/index.js";
import { isHarnessControllable } from "../providers/catalog.js";
import {
  buildStackOptions,
  chooseProviderOrder,
  defaultProviderOrder,
  renderCatalogPreview,
  unwrapPrompt
} from "./prompts.js";
import { renderProviderOrderSummary } from "../ui/terminal.js";
import { getSetupState } from "../providers/tool-status.js";
import { assertConfigTrusted } from "../config/trust.js";
import type { InteractiveProviderConfig, KeepitmovinConfig } from "../config/types.js";

export { getSetupState, type ToolStatus } from "../providers/tool-status.js";

export interface SetupOptions {
  cwd: string;
  configPath?: string;
  force?: boolean;
  showAllCatalog?: boolean;
  /** Start the wizard from built-in defaults instead of the saved config. */
  reset?: boolean;
}

export const applyProviderOrder = (
  config: KeepitmovinConfig,
  providerOrder: string[]
): KeepitmovinConfig => ({
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
): Promise<{ config: KeepitmovinConfig; configPath: string }> => {
  // Gate untrusted config-defined commands before getSetupState probes them.
  const loaded = await loadConfig(options.cwd, options.configPath);
  await assertConfigTrusted({
    config: loaded.config,
    configPath: loaded.path,
    interactive: Boolean(process.stdin.isTTY)
  });
  const state = await getSetupState(options.cwd, options.configPath);
  const startingConfig = options.reset || !state.exists ? defaultConfig() : state.config;

  const selectableProviderCount = startingConfig.harness.providers.filter((provider: InteractiveProviderConfig) => {
    const status = state.toolStatuses.find((entry) => entry.name === provider.name);
    return isHarnessControllable(provider) && status?.available;
  }).length;

  if (selectableProviderCount === 0) {
    throw new Error("keepitmovin didn't find any coding tools installed yet. Install one (Claude Code, Codex, …), then run `kim` again.");
  }

  intro(chalk.bgCyan.black(" keepitmovin "));
  log.message(
    chalk.gray("Pick your tools. keepitmovin runs the first one, and hands the next one your handoff file when it hits a limit.")
  );

  if (options.showAllCatalog) {
    note(renderCatalogPreview(state.catalogStatuses), "Other tools");
  }

  const stackOptions = buildStackOptions(startingConfig.harness.providers, state.toolStatuses);
  const initialValues = startingConfig.harness.providers
    .filter((provider: InteractiveProviderConfig) =>
      provider.enabled &&
      state.toolStatuses.some((status) => status.name === provider.name && status.available)
    )
    .map((provider: InteractiveProviderConfig) => provider.name);

  const selectedProviders = unwrapPrompt(await groupMultiselect<string>({
    message: "Which tools do you want to use?",
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
    throw new Error("Pick at least one installed tool to continue.");
  }

  // Suggest an order rather than asking for one; only walk the per-slot picker
  // when someone actually wants to change it.
  const suggestedOrder = defaultProviderOrder(
    selectedProviders,
    startingConfig.harness.providers,
    startingConfig.harness.providerOrder
  );
  note(
    renderProviderOrderSummary(startingConfig.harness.providers, suggestedOrder),
    "Your fallback order"
  );

  const wantsReorder = selectedProviders.length > 1 && unwrapPrompt(await confirm({
    message: "Change this order?",
    initialValue: false
  }));
  const providerOrder = wantsReorder
    ? await chooseProviderOrder(selectedProviders, startingConfig.harness.providers)
    : suggestedOrder;

  const config = applyProviderOrder(startingConfig, providerOrder);
  const configPath = await saveConfig(options.cwd, config, options.configPath);
  outro(`Saved. Run \`kim\` to start. (config: ${configPath})`);

  return { config, configPath };
};
