import path from "node:path";
import { execa } from "execa";
import { DEFAULT_CONFIG_FILE, loadConfig } from "./config.js";
import { getGitContext } from "./git.js";
import {
  getCatalogEntry,
  getProviderCatalog,
  type ProviderCatalogEntry
} from "./provider-catalog.js";
import type {
  InteractiveProviderConfig,
  ProviderConfig,
  ProviderIntegrationType,
  CodePassConfig
} from "./types.js";

export interface ProviderHealth {
  name: string;
  label?: string;
  enabled: boolean;
  command: string;
  available: boolean;
  detail: string;
  group?: "harness" | "guided";
  integrationType?: ProviderIntegrationType;
  controllable?: boolean;
  configured?: boolean;
  install?: string;
  auth?: string;
  homepage?: string;
  limitation?: string;
}

export interface DoctorSummary {
  cwd: string;
  configPath: string;
  usingDefaultConfig: boolean;
  gitRepo: boolean;
  changedFiles: string[];
  runsDir: string;
  logsDir: string;
  sessionsDir: string;
  providerHealth: ProviderHealth[];
  interactiveProviderHealth: ProviderHealth[];
  catalogProviderHealth: ProviderHealth[];
  readyProviderCount: number;
  readyInteractiveProviderCount: number;
}

const checkProviderCommand = async (
  provider: {
    name: string;
    label?: string;
    enabled: boolean;
    command?: string;
    versionArgs?: string[];
    group?: "harness" | "guided";
    integrationType?: ProviderIntegrationType;
    controllable?: boolean;
    configured?: boolean;
    install?: string;
    auth?: string;
    homepage?: string;
    limitation?: string;
  }
): Promise<ProviderHealth> => {
  if (!provider.command) {
    return {
      name: provider.name,
      label: provider.label,
      enabled: provider.enabled,
      command: "setup guide",
      available: false,
      detail: provider.group === "guided" ? "guided integration" : "command not configured",
      group: provider.group,
      integrationType: provider.integrationType,
      controllable: provider.controllable,
      configured: provider.configured,
      install: provider.install,
      auth: provider.auth,
      homepage: provider.homepage,
      limitation: provider.limitation
    };
  }

  try {
    const result = await execa(provider.command, provider.versionArgs ?? ["--version"], {
      reject: false,
      timeout: 5_000,
      stdout: "pipe",
      stderr: "pipe"
    });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    const diagnosticOutput = `${output}\n${result.shortMessage ?? ""}`.trim();
    const normalizedOutput = diagnosticOutput.toLowerCase();

    if (
      result.exitCode === 127 ||
      normalizedOutput.includes("enoent") ||
      normalizedOutput.includes("command not found") ||
      normalizedOutput.includes("not found")
    ) {
      return {
        name: provider.name,
        label: "label" in provider ? provider.label : undefined,
        enabled: provider.enabled,
        command: provider.command,
        available: false,
        detail: "not installed yet",
        group: provider.group,
        integrationType: provider.integrationType,
        controllable: provider.controllable,
        configured: provider.configured,
        install: provider.install,
        auth: provider.auth,
        homepage: provider.homepage,
        limitation: provider.limitation
      };
    }

    return {
      name: provider.name,
      label: "label" in provider ? provider.label : undefined,
      enabled: provider.enabled,
      command: provider.command,
      available: true,
      detail: output.split("\n")[0] ?? "command found",
      group: provider.group,
      integrationType: provider.integrationType,
      controllable: provider.controllable,
      configured: provider.configured,
      install: provider.install,
      auth: provider.auth,
      homepage: provider.homepage,
      limitation: provider.limitation
    };
  } catch (error) {
    const maybeError = error as { code?: string; message?: string };

    return {
      name: provider.name,
      label: "label" in provider ? provider.label : undefined,
      enabled: provider.enabled,
      command: provider.command,
      available: false,
      detail:
        maybeError.code === "ENOENT"
          ? "not installed yet"
          : maybeError.message ?? "command check failed",
      group: provider.group,
      integrationType: provider.integrationType,
      controllable: provider.controllable,
      configured: provider.configured,
      install: provider.install,
      auth: provider.auth,
      homepage: provider.homepage,
      limitation: provider.limitation
    };
  }
};

const catalogHealthInput = (
  entry: ProviderCatalogEntry,
  configuredNames: Set<string>
): Parameters<typeof checkProviderCommand>[0] => ({
  name: entry.name,
  label: entry.label,
  enabled: entry.defaultEnabled,
  command: entry.command,
  versionArgs: entry.versionArgs,
  group: entry.group,
  integrationType: entry.integrationType,
  controllable: entry.controllable,
  configured: configuredNames.has(entry.name),
  install: entry.install,
  auth: entry.auth,
  homepage: entry.homepage,
  limitation: entry.limitation
});

const interactiveHealthInput = (
  provider: InteractiveProviderConfig
): Parameters<typeof checkProviderCommand>[0] => {
  const catalogEntry = getCatalogEntry(provider.name);

  return {
    name: provider.name,
    label: provider.label,
    enabled: provider.enabled,
    command: provider.command,
    versionArgs: catalogEntry?.versionArgs,
    group: catalogEntry?.group ?? "harness",
    integrationType: provider.integrationType,
    controllable: provider.controllable,
    configured: true,
    install: catalogEntry?.install,
    auth: catalogEntry?.auth,
    homepage: catalogEntry?.homepage,
    limitation: catalogEntry?.limitation
  };
};

export interface DoctorOptions {
  includeAllCatalog?: boolean;
}

const resolveConfigDirs = (
  cwd: string,
  config: CodePassConfig,
  configPath?: string
): { runsDir: string; logsDir: string; sessionsDir: string } => {
  const baseDir = configPath ? path.dirname(configPath) : cwd;

  return {
    runsDir: path.isAbsolute(config.logs.runsDir)
      ? config.logs.runsDir
      : path.join(baseDir, config.logs.runsDir),
    logsDir: path.isAbsolute(config.logs.logsDir)
      ? config.logs.logsDir
      : path.join(baseDir, config.logs.logsDir),
    sessionsDir: path.isAbsolute(config.logs.sessionsDir)
      ? config.logs.sessionsDir
      : path.join(baseDir, config.logs.sessionsDir)
  };
};

export const runDoctor = async (
  cwdInput: string,
  configPath?: string,
  options: DoctorOptions = {}
): Promise<DoctorSummary> => {
  const cwd = path.resolve(cwdInput);
  const loaded = await loadConfig(cwd, configPath);
  const gitContext = await getGitContext(cwd, loaded.config.context.maxDiffChars);
  const configuredInteractiveNames = new Set(
    loaded.config.harness.providers.map((provider) => provider.name)
  );
  const providerHealth = await Promise.all(
    loaded.config.providers.map((provider) => checkProviderCommand(provider))
  );
  const interactiveProviderHealth = await Promise.all(
    loaded.config.harness.providers.map((provider) => checkProviderCommand(interactiveHealthInput(provider)))
  );
  const catalogProviderHealth = options.includeAllCatalog
    ? await Promise.all(
        getProviderCatalog().map((entry) => checkProviderCommand(
          catalogHealthInput(entry, configuredInteractiveNames)
        ))
      )
    : [];
  const controllableInteractiveProviderHealth = interactiveProviderHealth.filter(
    (provider) => provider.controllable !== false
  );
  const dirs = resolveConfigDirs(cwd, loaded.config, loaded.path);

  return {
    cwd,
    configPath: loaded.path ?? path.join(cwd, DEFAULT_CONFIG_FILE),
    usingDefaultConfig: !loaded.path,
    gitRepo: gitContext.isGitRepo,
    changedFiles: gitContext.changedFiles,
    runsDir: dirs.runsDir,
    logsDir: dirs.logsDir,
    sessionsDir: dirs.sessionsDir,
    providerHealth,
    interactiveProviderHealth,
    catalogProviderHealth,
    readyProviderCount: providerHealth.filter(
      (provider) => provider.enabled && provider.available
    ).length,
    readyInteractiveProviderCount: controllableInteractiveProviderHealth.filter(
      (provider) => provider.enabled && provider.available
    ).length
  };
};
