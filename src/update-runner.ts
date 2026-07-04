import { confirm, isCancel } from "@clack/prompts";
import { execa } from "execa";
import { getCatalogEntry, type ProviderCommandSpec } from "./provider-catalog.js";
import type { InteractiveProviderConfig, CodePassConfig } from "./types.js";

export type ProviderFreshnessAction =
  | "checked"
  | "installed"
  | "updated"
  | "skipped"
  | "missing"
  | "failed";

export interface ProviderFreshnessResult {
  provider: string;
  label: string;
  action: ProviderFreshnessAction;
  command?: string;
  detail: string;
}

export interface CommandRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type UpdateCommandRunner = (
  command: string,
  args: string[],
  cwd: string
) => Promise<CommandRunResult>;

const commandMissing = (diagnostic: string, exitCode?: number): boolean => {
  const normalized = diagnostic.toLowerCase();

  return exitCode === 127 ||
    normalized.includes("enoent") ||
    normalized.includes("command not found") ||
    normalized.includes("not found");
};

export const defaultRunner: UpdateCommandRunner = async (
  command,
  args,
  cwd
): Promise<CommandRunResult> => {
  const result = await execa(command, args, {
    cwd,
    reject: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr
  };
};

export const checkProviderCommand = async (
  provider: InteractiveProviderConfig,
  cwd: string,
  runner: UpdateCommandRunner
): Promise<{ available: boolean; detail: string }> => {
  const catalogEntry = getCatalogEntry(provider.name);
  const versionArgs = catalogEntry?.versionArgs ?? ["--version"];

  try {
    const result = await runner(provider.command, versionArgs, cwd);
    const diagnostic = `${result.stdout}\n${result.stderr}`.trim();
    const available = !commandMissing(diagnostic, result.exitCode);

    return {
      available,
      detail: available ? diagnostic.split("\n")[0] ?? "available" : "not installed yet"
    };
  } catch (error) {
    const maybeError = error as { code?: string; message?: string };

    return {
      available: false,
      detail:
        maybeError.code === "ENOENT"
          ? "not installed yet"
          : maybeError.message ?? "command check failed"
    };
  }
};

export const getProvidersForFreshness = (config: CodePassConfig): InteractiveProviderConfig[] => {
  const providerMap = new Map(
    config.harness.providers.map((provider) => [provider.name, provider])
  );
  const names = config.updates.includeDisabledProviders
    ? config.harness.providers.map((provider) => provider.name)
    : config.harness.providerOrder;
  const seen = new Set<string>();

  return names
    .map((name) => providerMap.get(name))
    .filter((provider): provider is InteractiveProviderConfig => {
      if (!provider || seen.has(provider.name)) {
        return false;
      }

      seen.add(provider.name);
      return config.updates.includeDisabledProviders || provider.enabled;
    });
};

export const runMaintenanceCommand = async (
  provider: InteractiveProviderConfig,
  commandSpec: ProviderCommandSpec,
  cwd: string,
  runner: UpdateCommandRunner
): Promise<ProviderFreshnessResult> => {
  const result = await runner(commandSpec.command, commandSpec.args, cwd);
  const output = `${result.stdout}\n${result.stderr}`.trim();

  if (result.exitCode !== 0) {
    return {
      provider: provider.name,
      label: provider.label,
      action: "failed",
      command: `${commandSpec.command} ${commandSpec.args.join(" ")}`.trim(),
      detail: output || `exit ${result.exitCode}`
    };
  }

  return {
    provider: provider.name,
    label: provider.label,
    action: commandSpec.label.toLowerCase().includes("install") ? "installed" : "updated",
    command: `${commandSpec.command} ${commandSpec.args.join(" ")}`.trim(),
    detail: output || commandSpec.label
  };
};

export const shouldRunCommand = async (
  label: string,
  commandSpec: ProviderCommandSpec,
  mode: CodePassConfig["updates"]["mode"],
  interactive: boolean
): Promise<boolean> => {
  if (mode === "always") {
    return true;
  }

  if (mode === "off" || !interactive) {
    return false;
  }

  const answer = await confirm({
    message: `${commandSpec.label} for ${label}?`,
    initialValue: true
  });

  return isCancel(answer) ? false : answer;
};
