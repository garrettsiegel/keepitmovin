import { PROVIDER_CATALOG } from "./catalog-entries.js";
import { DEFAULT_HANDOFF_ARGS, type ProviderCatalogEntry } from "./catalog-types.js";
import type { InteractiveProviderConfig, ProviderIntegrationType } from "../config/types.js";

export { PROVIDER_CATALOG } from "./catalog-entries.js";
export {
  DEFAULT_HANDOFF_ARGS,
  type ProviderCatalogEntry,
  type ProviderCatalogGroup,
  type ProviderCommandSpec
} from "./catalog-types.js";

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

// Hidden entries stay in the catalog so configs that already reference them
// keep launching, but they are excluded from defaults, the setup wizard, and docs.
export const isHiddenCatalogEntry = (entry: ProviderCatalogEntry): boolean =>
  entry.supportLevel === "hidden";

export const isHiddenProviderName = (name: string): boolean => {
  const entry = getCatalogEntry(name);
  return entry ? isHiddenCatalogEntry(entry) : false;
};

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
    usageProbe: entry.usageProbe,
    compactionProbe: entry.compactionProbe
  };
};

export const getDefaultInteractiveProviders = (): InteractiveProviderConfig[] =>
  PROVIDER_CATALOG
    .filter((entry) => isCatalogHarnessProvider(entry) && !isHiddenCatalogEntry(entry))
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
        usageProbe: catalogProvider.usageProbe,
        compactionProbe: catalogProvider.compactionProbe
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

/**
 * Appends newly-introduced default-enabled catalog providers to a legacy
 * `providerOrder`. `mergeCatalogInteractiveProviders` adds new catalog tools
 * (e.g. Grok Build, Cursor Agent) to an existing config with `enabled: true`, but
 * `getEnabledInteractiveProviders` only runs names listed in `providerOrder` — so
 * without this the new tools show as enabled yet never join the fallback chain.
 * Only providers absent from the user's original config are appended (never ones
 * they deliberately dropped from the order), and only at the end of the chain.
 */
export const reconcileProviderOrder = (
  configuredProviders: InteractiveProviderConfig[],
  mergedProviders: InteractiveProviderConfig[],
  providerOrder: string[]
): string[] => {
  const configuredNames = new Set(configuredProviders.map((provider) => provider.name));
  const orderNames = new Set(providerOrder);

  const appended = mergedProviders
    .filter(
      (provider) =>
        !configuredNames.has(provider.name) &&
        !orderNames.has(provider.name) &&
        provider.enabled &&
        isHarnessControllable(provider) &&
        // Never auto-add a hidden tool to a user's chain, even if one somehow
        // arrives enabled — hidden tools only run when explicitly configured.
        !isHiddenProviderName(provider.name)
    )
    .map((provider) => provider.name);

  return appended.length > 0 ? [...providerOrder, ...appended] : providerOrder;
};
