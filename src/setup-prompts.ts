import { cancel, isCancel, select } from "@clack/prompts";
import { isHarnessControllable } from "./provider-catalog.js";
import type { ToolStatus } from "./tool-status.js";
import type { InteractiveProviderConfig } from "./types.js";

export const unwrapPrompt = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel("CodePass setup canceled.");
    throw new Error("CodePass setup canceled.");
  }

  return value;
};

export const chooseProviderOrder = async (
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

export const buildStackOptions = (
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

export const renderCatalogPreview = (statuses: ToolStatus[]): string => {
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
