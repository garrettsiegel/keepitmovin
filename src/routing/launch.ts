import { cancel, isCancel, select, text } from "@clack/prompts";
import { getChangedFiles } from "../util/git.js";
import { overrideTier, classifyTask } from "./classify.js";
import type { CliOptions } from "../cli-options.js";
import type { KeepitmovinConfig, RouteDecision, RoutingTier } from "../config/types.js";

const hasExplicitRouteOverride = (options: CliOptions): boolean =>
  Boolean(options.tier || options.model || options.effort);

export const isRoutingRequested = (
  options: CliOptions,
  config: KeepitmovinConfig,
  task: string | undefined
): boolean =>
  Boolean(task) && options.route !== false && (config.routing.enabled || hasExplicitRouteOverride(options));

export const resolveTaskForLaunch = async (
  options: CliOptions,
  config: KeepitmovinConfig
): Promise<string | undefined> => {
  const provided = options.task?.trim();
  if (provided) {
    return provided;
  }

  if (
    options.route === false ||
    (!config.routing.enabled && !hasExplicitRouteOverride(options)) ||
    !config.routing.promptForTask ||
    !process.stdin.isTTY
  ) {
    return undefined;
  }

  const task = await text({
    message: "What should this session accomplish?",
    placeholder: "Describe the work to start",
    validate: (value) => value?.trim() ? undefined : "Enter a task or disable routing for this run."
  });
  if (isCancel(task)) {
    cancel("keepitmovin canceled.");
    throw new Error("keepitmovin canceled.");
  }
  return task.trim();
};

const chooseInteractiveTier = async (decision: RouteDecision): Promise<RoutingTier | "provider_default"> => {
  const tiers: RoutingTier[] = ["light", "standard", "deep", "max"];
  const choice = await select<RoutingTier | "provider_default">({
    message: `Task route: ${decision.tier} (${decision.reason}). Continue with:`,
    options: [
      { label: `${decision.tier} (recommended)`, value: decision.tier },
      ...tiers
        .filter((tier) => tier !== decision.tier)
        .map((tier) => ({ label: tier, value: tier })),
      { label: "Provider defaults (no routing)", value: "provider_default" }
    ],
    initialValue: decision.tier
  });
  if (isCancel(choice)) {
    cancel("keepitmovin canceled.");
    throw new Error("keepitmovin canceled.");
  }
  return choice;
};

export const resolveRouteForLaunch = async (
  options: CliOptions,
  config: KeepitmovinConfig,
  cwd: string,
  task: string | undefined
): Promise<RouteDecision | undefined> => {
  if (!isRoutingRequested(options, config, task)) {
    return undefined;
  }

  let decision = classifyTask({ task: task ?? "", changedFiles: await getChangedFiles(cwd) });
  if (options.tier) {
    decision = overrideTier(decision, options.tier);
  } else if (options.model || options.effort) {
    decision = {
      ...decision,
      reason: "explicit model or reasoning override",
      signals: [...decision.signals, "explicit model or reasoning override"],
      source: "model_override"
    };
  }

  if (
    config.routing.enabled &&
    config.routing.allowOverride &&
    process.stdin.isTTY &&
    !hasExplicitRouteOverride(options)
  ) {
    const selectedTier = await chooseInteractiveTier(decision);
    if (selectedTier === "provider_default") {
      return undefined;
    }
    if (selectedTier !== decision.tier) {
      decision = overrideTier(decision, selectedTier);
    }
  }

  return decision;
};
