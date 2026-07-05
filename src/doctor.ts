import path from "node:path";
import process from "node:process";
import { DEFAULT_CONFIG_FILE, loadConfig } from "./config.js";
import { getGitContext } from "./git.js";
import { assertConfigTrusted } from "./trust.js";
import { getProviderCatalog } from "./provider-catalog.js";
import {
  catalogHealthInput,
  checkProviderCommand,
  interactiveHealthInput,
  type ProviderHealth
} from "./provider-health.js";
import { readProviderUsage, resolveUsageProbe, type UsageSnapshot } from "./usage-probe.js";
import type { CodePassConfig } from "./types.js";

export type { ProviderHealth } from "./provider-health.js";

export interface UsageProbeStatus {
  name: string;
  label: string;
  snapshot?: UsageSnapshot;
}

export interface DoctorSummary {
  cwd: string;
  configPath: string;
  usingDefaultConfig: boolean;
  gitRepo: boolean;
  changedFiles: string[];
  sessionsDir: string;
  interactiveProviderHealth: ProviderHealth[];
  catalogProviderHealth: ProviderHealth[];
  readyInteractiveProviderCount: number;
  usageProbes: UsageProbeStatus[];
}

export interface DoctorOptions {
  includeAllCatalog?: boolean;
}

const resolveSessionsDir = (
  cwd: string,
  config: CodePassConfig,
  configPath?: string
): string => {
  const baseDir = configPath ? path.dirname(configPath) : cwd;

  return path.isAbsolute(config.logs.sessionsDir)
    ? config.logs.sessionsDir
    : path.join(baseDir, config.logs.sessionsDir);
};

export const runDoctor = async (
  cwdInput: string,
  configPath?: string,
  options: DoctorOptions = {}
): Promise<DoctorSummary> => {
  const cwd = path.resolve(cwdInput);
  const loaded = await loadConfig(cwd, configPath);
  await assertConfigTrusted({
    config: loaded.config,
    configPath: loaded.path,
    interactive: Boolean(process.stdin.isTTY)
  });
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

  // Read each probed provider's own reported usage. Never fails doctor — a
  // missing/unreadable session file just yields an undefined snapshot.
  const usageProbes = await Promise.all(
    loaded.config.harness.providers
      .filter((provider) => provider.enabled && resolveUsageProbe(provider, loaded.config))
      .map(async (provider) => ({
        name: provider.name,
        label: provider.label,
        snapshot: await readProviderUsage(provider.usageProbe!)
      }))
  );

  return {
    cwd,
    configPath: loaded.path ?? path.join(cwd, DEFAULT_CONFIG_FILE),
    usingDefaultConfig: !loaded.path,
    gitRepo: gitContext.isGitRepo,
    changedFiles: gitContext.changedFiles,
    sessionsDir: resolveSessionsDir(cwd, loaded.config, loaded.path),
    interactiveProviderHealth,
    catalogProviderHealth,
    readyInteractiveProviderCount: controllableInteractiveProviderHealth.filter(
      (provider) => provider.enabled && provider.available
    ).length,
    usageProbes
  };
};
