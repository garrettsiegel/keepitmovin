import { getChangedFiles } from "../util/git.js";
import { classifyTask, escalateTier, overrideTier, type RouteInput } from "./classify.js";
import { classifyWithJev } from "./jev.js";
import type { CliOptions } from "../cli-options.js";
import type { KeepitmovinConfig, RouteDecision } from "../config/types.js";

const JEV_FALLBACK_SIGNAL = "Jev unavailable; used local classifier";

export const classifyRoute = async (
  config: KeepitmovinConfig,
  input: RouteInput
): Promise<RouteDecision> => {
  if (config.routing.classifier !== "jev") {
    return classifyTask(input);
  }

  const apiKey = process.env.TYPESAFE_API_KEY;
  const jevDecision = apiKey ? await classifyWithJev(input.task, apiKey) : undefined;
  if (!jevDecision) {
    const localDecision = classifyTask(input);
    return {
      ...localDecision,
      signals: [...localDecision.signals, JEV_FALLBACK_SIGNAL]
    };
  }

  if ((input.repeatedFailures ?? 0) < 2) {
    return jevDecision;
  }
  return {
    ...jevDecision,
    tier: escalateTier(jevDecision.tier),
    reason: "escalated after repeated failure",
    signals: [...jevDecision.signals, "escalated after repeated failure"]
  };
};

export const isRoutingRequested = (
  options: CliOptions,
  config: { routing: Pick<KeepitmovinConfig["routing"], "enabled"> },
  task: string | undefined
): boolean => Boolean(task) && (config.routing.enabled || Boolean(options.tier));

export const resolveTaskForLaunch = (options: CliOptions): string | undefined =>
  options.task?.trim() || undefined;

export const resolveRouteForLaunch = async (
  options: CliOptions,
  config: KeepitmovinConfig,
  cwd: string,
  task: string | undefined
): Promise<RouteDecision | undefined> => {
  if (!isRoutingRequested(options, config, task)) {
    return undefined;
  }

  // The classifier decides; `--tier` overrides it — and an explicit tier skips the
  // network classifier entirely. No confirmation prompt; pass `--tier` to override.
  const input = { task: task ?? "", changedFiles: await getChangedFiles(cwd) };
  if (options.tier) {
    return overrideTier(classifyTask(input), options.tier);
  }
  return classifyRoute(config, input);
};
