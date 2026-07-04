import { log, spinner } from "@clack/prompts";
import { getCatalogEntry, type ProviderCommandSpec } from "./provider-catalog.js";
import {
  checkProviderCommand,
  defaultRunner,
  getProvidersForFreshness,
  runMaintenanceCommand,
  shouldRunCommand
} from "./update-runner.js";
import type { ProviderFreshnessResult, UpdateCommandRunner } from "./update-runner.js";
import type { InteractiveProviderConfig, CodePassConfig } from "./types.js";

export type {
  CommandRunResult,
  ProviderFreshnessAction,
  ProviderFreshnessResult,
  UpdateCommandRunner
} from "./update-runner.js";

export interface EnsureProviderFreshnessOptions {
  cwd: string;
  config: CodePassConfig;
  providers?: InteractiveProviderConfig[];
  interactive?: boolean;
  runner?: UpdateCommandRunner;
}

export const ensureProviderFreshness = async (
  options: EnsureProviderFreshnessOptions
): Promise<ProviderFreshnessResult[]> => {
  if (!options.config.updates.checkOnStart || options.config.updates.mode === "off") {
    return [];
  }

  const runner = options.runner ?? defaultRunner;
  const providers = options.providers ?? getProvidersForFreshness(options.config);
  const interactive = options.interactive ?? process.stdout.isTTY;
  const shouldRender = interactive && providers.length > 0;
  const status = shouldRender ? spinner({ indicator: "dots" }) : undefined;
  const results: ProviderFreshnessResult[] = [];
  const shouldRunWithSpinner = async (
    label: string,
    commandSpec: ProviderCommandSpec
  ): Promise<boolean> => {
    if (options.config.updates.mode === "prompt" && interactive) {
      status?.stop();
      const shouldRun = await shouldRunCommand(
        label,
        commandSpec,
        options.config.updates.mode,
        interactive
      );
      status?.start("Checking your selected tools...");
      return shouldRun;
    }

    return shouldRunCommand(
      label,
      commandSpec,
      options.config.updates.mode,
      interactive
    );
  };

  status?.start("Checking your selected tools...");

  for (const provider of providers) {
    const catalogEntry = getCatalogEntry(provider.name);
    status?.message(`Checking ${provider.label}...`);
    const local = await checkProviderCommand(provider, options.cwd, runner);

    if (!local.available) {
      const installCommand = catalogEntry?.installCommands?.[0];
      if (installCommand && await shouldRunWithSpinner(provider.label, installCommand)) {
        status?.message(`Installing ${provider.label}...`);
        results.push(await runMaintenanceCommand(provider, installCommand, options.cwd, runner));
      } else {
        results.push({
          provider: provider.name,
          label: provider.label,
          action: "missing",
          detail: catalogEntry?.install ?? local.detail
        });
      }
      continue;
    }

    const updateCommand = catalogEntry?.updateCommands?.[0];
    if (!updateCommand) {
      results.push({
        provider: provider.name,
        label: provider.label,
        action: "checked",
        detail: local.detail
      });
      continue;
    }

    if (!await shouldRunWithSpinner(provider.label, updateCommand)) {
      results.push({
        provider: provider.name,
        label: provider.label,
        action: "skipped",
        detail: local.detail
      });
      continue;
    }

    status?.message(`Updating ${provider.label}...`);
    results.push(await runMaintenanceCommand(provider, updateCommand, options.cwd, runner));
  }

  status?.stop("Tools checked.");

  if (shouldRender) {
    const failures = results.filter((result) => result.action === "failed");
    const missing = results.filter((result) => result.action === "missing");

    for (const result of failures) {
      log.warn(`${result.label} update failed. CodePass will still try to launch it.\n${result.detail}`);
    }

    for (const result of missing) {
      log.warn(`${result.label} is not ready yet.\n${result.detail}`);
    }
  }

  return results;
};
