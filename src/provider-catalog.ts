import {
  DEFAULT_HANDOFF_ARGS,
  PROVIDER_CATALOG,
  type ProviderCatalogEntry
} from "./provider-catalog-data.js";
import type { InteractiveProviderConfig, ProviderIntegrationType } from "./types.js";

export {
  PROVIDER_CATALOG,
  type ProviderCatalogEntry,
  type ProviderCatalogGroup,
  type ProviderCommandSpec
} from "./provider-catalog-data.js";

const HARNESS_TYPES = new Set<ProviderIntegrationType>([
  "pty",
  "pty_with_bootstrap_input",
  "custom_command"
]);

export const getProviderCatalog = (): ProviderCatalogEntry[] => PROVIDER_CATALOG;

export const getCatalogEntry = (name: string): ProviderCatalogEntry | undefined =>
  PROVIDER_CATALOG.find((entry) => entry.name === name);

export const isCatalogHarnessProvider = (entry: ProviderCatalogEntry): boolean =>
  entry.group === "harness" && entry.controllable && HARNESS_TYPES.has(entry.integrationType);

export const isHarnessControllable = (provider: Pick<InteractiveProviderConfig, "controllable" | "integrationType">): boolean =>
  (provider.controllable ?? true) && HARNESS_TYPES.has(provider.integrationType);

export const catalogEntryToInteractiveProvider = (
  entry: ProviderCatalogEntry
): InteractiveProviderConfig => {
  if (!entry.command) {
    throw new Error(`Catalog entry is not launchable: ${entry.name}`);
  }

  return {
    name: entry.name,
    label: entry.label,
    enabled: entry.defaultEnabled,
    command: entry.command,
    args: entry.args ?? [],
    handoffArgs: entry.handoffArgs ?? DEFAULT_HANDOFF_ARGS,
    integrationType: entry.integrationType,
    bootstrapInput: entry.bootstrapInput,
    handoffBootstrapInput: entry.handoffBootstrapInput,
    controllable: entry.controllable,
    limitPatterns: entry.limitPatterns,
    usageProbe: entry.usageProbe
  };
};

export const getDefaultInteractiveProviders = (): InteractiveProviderConfig[] =>
  PROVIDER_CATALOG
    .filter(isCatalogHarnessProvider)
    .map(catalogEntryToInteractiveProvider);

export const getDefaultProviderOrder = (): string[] =>
  getDefaultInteractiveProviders()
    .filter((provider) => provider.enabled)
    .map((provider) => provider.name);

export const mergeCatalogInteractiveProviders = (
  providers: InteractiveProviderConfig[]
): InteractiveProviderConfig[] => {
  const migratedProviders = providers.map((provider) => {
    const catalogEntry = getCatalogEntry(provider.name);

    if (!catalogEntry) {
      return provider;
    }

    if (!catalogEntry.deprecated && isCatalogHarnessProvider(catalogEntry)) {
      const catalogProvider = catalogEntryToInteractiveProvider(catalogEntry);

      return {
        ...provider,
        label: catalogProvider.label,
        command: catalogProvider.command,
        args: catalogProvider.args,
        handoffArgs: catalogProvider.handoffArgs,
        integrationType: catalogProvider.integrationType,
        bootstrapInput: catalogProvider.bootstrapInput,
        handoffBootstrapInput: catalogProvider.handoffBootstrapInput,
        controllable: catalogProvider.controllable,
        limitPatterns: catalogProvider.limitPatterns,
        usageProbe: catalogProvider.usageProbe
      };
    }

    if (!catalogEntry.deprecated) {
      return provider;
    }

    return {
      ...provider,
      label: catalogEntry.label,
      enabled: false,
      integrationType: catalogEntry.integrationType,
      controllable: false
    };
  });
  const configuredNames = new Set(migratedProviders.map((provider) => provider.name));
  const catalogDefaults = getDefaultInteractiveProviders()
    .filter((provider) => !configuredNames.has(provider.name));

  return [...migratedProviders, ...catalogDefaults];
};
