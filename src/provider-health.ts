import { execa } from "execa";
import { getCatalogEntry, type ProviderCatalogEntry } from "./provider-catalog.js";
import type { InteractiveProviderConfig, ProviderIntegrationType } from "./types.js";

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

export const checkProviderCommand = async (
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
      // Ignore stdin so install/auth prompts (e.g. stub CLIs) cannot hang the probe.
      stdin: "ignore",
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

export const catalogHealthInput = (
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

export const interactiveHealthInput = (
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
