import {
  box,
  confirm,
  groupMultiselect,
  intro,
  log,
  note,
  outro
} from "@clack/prompts";
import process from "node:process";
import chalk from "chalk";
import { defaultConfig, loadConfig, saveConfig } from "../config/index.js";
import { isHarnessControllable } from "../providers/catalog.js";
import { buildStackOptions, chooseProviderOrder, renderCatalogPreview, unwrapPrompt } from "./prompts.js";
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

export const applyRoutingPreference = (
  config: KeepitmovinConfig,
  enabled: boolean
): KeepitmovinConfig => ({
  ...config,
  routing: {
    ...config.routing,
    enabled
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
  box(
    [
      "keepitmovin runs your coding tools in one terminal, in a fallback order you choose.",
      "When one tool hits a limit, it hands the next tool your handoff file so you keep going."
    ].join("\n"),
    "What this does",
    {
      rounded: true
    }
  );
  note(
    [
      "1. Pick the tools you want and the order to try them.",
      "2. keepitmovin starts the first installed tool for you.",
      "3. If it hits a limit, keepitmovin switches tools using .keepitmovin/current/handoff.md."
    ].join("\n"),
    "How it works"
  );

  if (startingConfig.updates.checkOnStart) {
    note(
      startingConfig.updates.mode === "always"
        ? "On each start, keepitmovin checks your tools for updates and installs them automatically."
        : "On each start, keepitmovin checks your tools for updates and asks before installing any.",
      "Tool updates"
    );
  }

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

  const providerOrder = await chooseProviderOrder(
    selectedProviders,
    startingConfig.harness.providers
  );
  const chainSummary = renderProviderOrderSummary(
    startingConfig.harness.providers,
    providerOrder
  );
  note(chainSummary, "Your fallback order");

  const wantsOpenRouter = selectedProviders.includes("cline")
    ? unwrapPrompt(await confirm({
        message: "Do you plan to use Cline with OpenRouter models like DeepSeek?",
        initialValue: true
      }))
    : false;

  if (wantsOpenRouter) {
    log.info("keepitmovin will keep Cline configurable. Add OpenRouter-specific Cline flags once the Cline CLI is installed and verified.");
  }

  const routingEnabled = unwrapPrompt(await confirm({
    message: "Turn on smart task routing? (picks a model per task; asks how it went at the end)",
    initialValue: startingConfig.routing.enabled
  }));
  const config = applyRoutingPreference(
    applyProviderOrder(startingConfig, providerOrder),
    routingEnabled
  );
  const configPath = await saveConfig(options.cwd, config, options.configPath);
  outro(`Saved. Run \`kim\` to start. (config: ${configPath})`);

  return { config, configPath };
};
