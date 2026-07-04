import { execa } from "execa";
import path from "node:path";
import { DEFAULT_CONFIG_FILE, loadConfig } from "./config.js";
import { getCatalogEntry, getProviderCatalog, type ProviderCatalogEntry } from "./provider-catalog.js";
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
