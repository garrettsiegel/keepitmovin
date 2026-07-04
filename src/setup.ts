import {
  box,
  cancel,
  confirm,
  groupMultiselect,
  intro,
  isCancel,
  log,
  note,
  outro,
  select
} from "@clack/prompts";
import chalk from "chalk";
import { execa } from "execa";
import path from "node:path";
import {
  DEFAULT_CONFIG_FILE,
  defaultConfig,
  loadConfig,
  saveConfig
} from "./config.js";
import {
  getCatalogEntry,
  getProviderCatalog,
  isHarnessControllable,
  type ProviderCatalogEntry
} from "./provider-catalog.js";
import { renderProviderOrderSummary } from "./terminal-ui.js";
import type { InteractiveProviderConfig, CodePassConfig } from "./types.js";

export interface ToolStatus {
  name: string;
  label: string;
  command: string;
  available: boolean;
  detail: string;
  group?: "harness" | "guided";
  integrationType?: CodePassConfig["harness"]["providers"][number]["integrationType"];
  controllable?: boolean;
  summary?: string;
  limitation?: string;
  install?: string;
  auth?: string;
}

export interface SetupOptions {
  cwd: string;
  configPath?: string;
  force?: boolean;
  showAllCatalog?: boolean;
  /** Start the wizard from built-in defaults instead of the saved config. */
  reset?: boolean;
}

const unwrapPrompt = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel("CodePass setup canceled.");
    throw new Error("CodePass setup canceled.");
  }

  return value;
};

const chooseProviderOrder = async (
  selectedProviders: string[],
  providers: InteractiveProviderConfig[]
): Promise<string[]> => {
  if (selectedProviders.length <= 1) {
    return selectedProviders;
  }

  const providerMap = new Map(providers.map((provider) => [provider.name, provider]));
  const remaining = [...selectedProviders];
  const ordered: string[] = [];

  while (remaining.length > 1) {
    const previousProvider = ordered.at(-1);
    const message = previousProvider
      ? `If ${providerMap.get(previousProvider)?.label ?? previousProvider} is blocked, which tool should CodePass try next?`
      : "Which tool should CodePass start first?";
    const nextProvider = unwrapPrompt(await select({
      message,
      options: remaining.map((name) => ({
        value: name,
        label: providerMap.get(name)?.label ?? name
      }))
    }));

    ordered.push(nextProvider);
    remaining.splice(remaining.indexOf(nextProvider), 1);
  }

  return [...ordered, ...remaining];
};

const commandMissing = (diagnostic: string, exitCode?: number): boolean => {
  const normalized = diagnostic.toLowerCase();

  return exitCode === 127 ||
    normalized.includes("enoent") ||
    normalized.includes("command not found") ||
    normalized.includes("not found");
};

const checkCommand = async (
  provider: {
    name: string;
    label: string;
    command?: string;
    versionArgs?: string[];
    group?: "harness" | "guided";
    integrationType?: CodePassConfig["harness"]["providers"][number]["integrationType"];
    controllable?: boolean;
    summary?: string;
    limitation?: string;
    install?: string;
    auth?: string;
  }
): Promise<ToolStatus> => {
  if (!provider.command) {
    return {
      name: provider.name,
      label: provider.label,
      command: "setup guide",
      available: false,
      detail: "guided setup",
      group: provider.group,
      integrationType: provider.integrationType,
      controllable: provider.controllable,
      summary: provider.summary,
      limitation: provider.limitation,
      install: provider.install,
      auth: provider.auth
    };
  }

  try {
    const result = await execa(provider.command, provider.versionArgs ?? ["--version"], {
      reject: false,
      timeout: 5_000,
      stdout: "pipe",
      stderr: "pipe"
    });
    const diagnostic = `${result.stdout}\n${result.stderr}\n${result.shortMessage ?? ""}`.trim();
    const available = !commandMissing(diagnostic, result.exitCode);

    return {
      name: provider.name,
      label: provider.label,
      command: provider.command,
      available,
      detail: available ? diagnostic.split("\n")[0] ?? "found" : "not installed yet",
      group: provider.group,
      integrationType: provider.integrationType,
      controllable: provider.controllable,
      summary: provider.summary,
      limitation: provider.limitation,
      install: provider.install,
      auth: provider.auth
    };
  } catch (error) {
    const maybeError = error as { code?: string; message?: string };
    return {
      name: provider.name,
      label: provider.label,
      command: provider.command,
      available: false,
      detail:
        maybeError.code === "ENOENT"
          ? "not installed yet"
          : maybeError.message ?? "command check failed",
      group: provider.group,
      integrationType: provider.integrationType,
      controllable: provider.controllable,
      summary: provider.summary,
      limitation: provider.limitation,
      install: provider.install,
      auth: provider.auth
    };
  }
};

const catalogStatusInput = (entry: ProviderCatalogEntry): Parameters<typeof checkCommand>[0] => ({
  name: entry.name,
  label: entry.label,
  command: entry.command,
  versionArgs: entry.versionArgs,
  group: entry.group,
  integrationType: entry.integrationType,
  controllable: entry.controllable,
  summary: entry.summary,
  limitation: entry.limitation,
  install: entry.install,
  auth: entry.auth
});

const providerStatusInput = (
  provider: InteractiveProviderConfig
): Parameters<typeof checkCommand>[0] => {
  const catalogEntry = getCatalogEntry(provider.name);

  return {
    name: provider.name,
    label: provider.label,
    command: provider.command,
    versionArgs: catalogEntry?.versionArgs,
    group: catalogEntry?.group ?? "harness",
    integrationType: provider.integrationType,
    controllable: provider.controllable,
    summary: catalogEntry?.summary,
    limitation: catalogEntry?.limitation,
    install: catalogEntry?.install,
    auth: catalogEntry?.auth
  };
};

export const getSetupState = async (
  cwd: string,
  configPath?: string
): Promise<{
  config: CodePassConfig;
  configPath: string;
  exists: boolean;
  toolStatuses: ToolStatus[];
  catalogStatuses: ToolStatus[];
}> => {
  const loaded = await loadConfig(cwd, configPath);
  const config = loaded.config;
  const toolStatuses = await Promise.all(
    config.harness.providers.map((provider) => checkCommand(providerStatusInput(provider)))
  );
  const catalogStatuses = await Promise.all(
    getProviderCatalog().map((entry) => checkCommand(catalogStatusInput(entry)))
  );

  return {
    config,
    configPath: loaded.path ?? path.join(cwd, DEFAULT_CONFIG_FILE),
    exists: Boolean(loaded.path),
    toolStatuses,
    catalogStatuses
  };
};

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

const buildStackOptions = (
  providers: InteractiveProviderConfig[],
  statuses: ToolStatus[]
): Record<string, Array<{ value: string; label: string; hint?: string; disabled?: boolean }>> => {
  const ready: Array<{ value: string; label: string; hint?: string }> = [];
  const addLater: Array<{ value: string; label: string; hint?: string; disabled: boolean }> = [];

  for (const provider of providers.filter((entry) => isHarnessControllable(entry))) {
    const status = statuses.find((entry) => entry.name === provider.name);
    const option = {
      value: provider.name,
      label: provider.label,
      hint: status?.available
        ? status.detail
        : status?.install ?? "Install later"
    };

    if (status?.available) {
      ready.push(option);
    } else {
      addLater.push({ ...option, disabled: true });
    }
  }

  return {
    ...(ready.length > 0 ? { "Ready now": ready } : {}),
    ...(addLater.length > 0 ? { "Add later": addLater } : {})
  };
};

const renderCatalogPreview = (statuses: ToolStatus[]): string => {
  const guided = statuses
    .filter((status) => status.group === "guided" || status.controllable === false)
    .slice(0, 8);

  if (guided.length === 0) {
    return "No guided integrations found yet.";
  }

  return guided
    .map((status) => `${status.label}: ${status.limitation ?? status.summary ?? "Guided setup only."}`)
    .join("\n");
};

export const runSetupWizard = async (
  options: SetupOptions
): Promise<{ config: CodePassConfig; configPath: string }> => {
  const state = await getSetupState(options.cwd, options.configPath);
  const startingConfig = options.reset || !state.exists ? defaultConfig() : state.config;

  const selectableProviderCount = startingConfig.harness.providers.filter((provider) => {
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
    .filter((provider) =>
      provider.enabled &&
      state.toolStatuses.some((status) => status.name === provider.name && status.available)
    )
    .map((provider) => provider.name);

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
