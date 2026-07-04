import path from "node:path";
import { DEFAULT_CONFIG_FILE, loadConfig } from "./config.js";
import { getGitContext } from "./git.js";
import { getProviderCatalog } from "./provider-catalog.js";
import {
  catalogHealthInput,
  checkProviderCommand,
  interactiveHealthInput,
  type ProviderHealth
} from "./provider-health.js";
import type { CodePassConfig } from "./types.js";

export type { ProviderHealth } from "./provider-health.js";

export interface DoctorSummary {
  cwd: string;
  configPath: string;
  usingDefaultConfig: boolean;
  gitRepo: boolean;
  changedFiles: string[];
  runsDir: string;
  logsDir: string;
  sessionsDir: string;
  interactiveProviderHealth: ProviderHealth[];
  catalogProviderHealth: ProviderHealth[];
  readyInteractiveProviderCount: number;
}

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
    interactiveProviderHealth,
    catalogProviderHealth,
    readyInteractiveProviderCount: controllableInteractiveProviderHealth.filter(
      (provider) => provider.enabled && provider.available
    ).length
  };
};
