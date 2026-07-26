import { cancel, isCancel, text } from "@clack/prompts";
import { getChangedFiles } from "../util/git.js";
import { overrideTier, classifyTask } from "./classify.js";
import type { CliOptions } from "../cli-options.js";
import type { KeepitmovinConfig, RouteDecision } from "../config/types.js";

export const isRoutingRequested = (
  options: CliOptions,
  config: KeepitmovinConfig,
  task: string | undefined
): boolean => Boolean(task) && (config.routing.enabled || Boolean(options.tier));

export const resolveTaskForLaunch = async (
  options: CliOptions,
  config: KeepitmovinConfig
): Promise<string | undefined> => {
  const provided = options.task?.trim();
  if (provided) {
    return provided;
  }

  if ((!config.routing.enabled && !options.tier) || !process.stdin.isTTY) {
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

export const resolveRouteForLaunch = async (
  options: CliOptions,
  config: KeepitmovinConfig,
  cwd: string,
  task: string | undefined
): Promise<RouteDecision | undefined> => {
  if (!isRoutingRequested(options, config, task)) {
    return undefined;
  }

  // The classifier decides; `--tier` overrides it. keepitmovin no longer asks
  // you to confirm the route mid-launch — pass `--tier` if you disagree with it.
  const decision = classifyTask({ task: task ?? "", changedFiles: await getChangedFiles(cwd) });
  return options.tier ? overrideTier(decision, options.tier) : decision;
};
