import { cancel, isCancel, select } from "@clack/prompts";
import { isHarnessControllable } from "../providers/catalog.js";
import type { ToolStatus } from "../providers/tool-status.js";
import type { InteractiveProviderConfig } from "../config/types.js";

export const unwrapPrompt = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel("keepitmovin setup canceled.");
    throw new Error("keepitmovin setup canceled.");
  }

  return value;
};

/**
 * The order keepitmovin suggests without asking: whatever the config already
 * said, then catalog order for anything newly picked. Good enough that most
 * people never need the reorder prompt below.
 */
export const defaultProviderOrder = (
  selectedProviders: string[],
  providers: InteractiveProviderConfig[],
  savedOrder: string[]
): string[] => {
  const rank = (name: string): number => {
    const saved = savedOrder.indexOf(name);
    if (saved >= 0) {
      return saved;
    }

    const catalogIndex = providers.findIndex((provider) => provider.name === name);
    return savedOrder.length + (catalogIndex < 0 ? providers.length : catalogIndex);
  };

  return [...selectedProviders].sort((left, right) => rank(left) - rank(right));
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
      ? `If ${providerMap.get(previousProvider)?.label ?? previousProvider} hits a limit, which tool should keepitmovin try next?`
      : "Which tool should keepitmovin start with?";
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

  const selectable = providers.filter(isHarnessControllable);

  for (const provider of selectable) {
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
    return "No other tools to show right now.";
  }

  return guided
    .map((status) => `${status.label}: ${status.limitation ?? status.summary ?? "Guided setup only."}`)
    .join("\n");
};
