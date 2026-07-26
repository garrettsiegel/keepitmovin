import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppliedRoute, InteractiveProviderConfig, ReasoningEffort, RouteDecision, RoutingTier } from "../config/types.js";
import type { ProviderLaunch } from "../providers/interactive.js";

interface CachedModel {
  slug: string;
  supportedReasoning: ReasoningEffort[];
}

export interface RouteOverrides {
  model?: string;
  effort?: ReasoningEffort;
  codexHome?: string;
  targetProvider?: string;
}

export const CODEX_ROUTE_PROFILES = {
  light: { candidates: ["gpt-5.6-luna", "gpt-5.4-mini"], effort: "low" },
  standard: { candidates: ["gpt-5.6-terra", "gpt-5.4"], effort: "medium" },
  deep: { candidates: ["gpt-5.6-sol", "gpt-5.5"], effort: "high" },
  max: { candidates: ["gpt-5.6-sol", "gpt-5.5"], effort: "max" }
} as const satisfies Record<RoutingTier, {
  candidates: readonly string[];
  effort: ReasoningEffort;
}>;

export const CLAUDE_ROUTE_PROFILES: Record<RoutingTier, { model: string; effort: ReasoningEffort }> = {
  light: { model: "haiku", effort: "low" },
  standard: { model: "sonnet", effort: "medium" },
  deep: { model: "opus", effort: "high" },
  max: { model: "fable", effort: "max" }
};

export const readCodexModels = async (codexHome?: string): Promise<CachedModel[]> => {
  const home = codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  try {
    const parsed = JSON.parse(await readFile(path.join(home, "models_cache.json"), "utf8")) as {
      models?: Array<{ slug?: unknown; supported_reasoning_levels?: Array<{ effort?: unknown }> }>;
    };
    return (parsed.models ?? []).flatMap((model) => {
      if (typeof model.slug !== "string") {
        return [];
      }
      const supportedReasoning = (model.supported_reasoning_levels ?? [])
        .map((level) => level.effort)
        .filter((effort): effort is ReasoningEffort =>
          ["low", "medium", "high", "xhigh", "max", "ultra"].includes(String(effort))
        );
      return [{ slug: model.slug, supportedReasoning }];
    });
  } catch {
    return [];
  }
};

export const resolveProviderRoute = async (
  provider: InteractiveProviderConfig,
  decision: RouteDecision,
  overrides: RouteOverrides = {}
): Promise<AppliedRoute> => {
  const appliesToProvider = !overrides.targetProvider || overrides.targetProvider === provider.name;
  const modelOverride = appliesToProvider ? overrides.model : undefined;
  const effortOverride = appliesToProvider ? overrides.effort : undefined;

  if (provider.name === "claude") {
    const profile = CLAUDE_ROUTE_PROFILES[decision.tier];
    if (effortOverride === "ultra") {
      throw new Error("Claude Code does not support the Codex-only ultra routing override.");
    }
    return {
      ...decision,
      source: modelOverride || effortOverride ? "model_override" : decision.source,
      provider: provider.name,
      model: modelOverride ?? profile.model,
      effort: effortOverride ?? profile.effort
    };
  }

  if (provider.name === "codex") {
    const models = await readCodexModels(overrides.codexHome);
    const profile = CODEX_ROUTE_PROFILES[decision.tier];
    const selected = modelOverride ?? profile.candidates.find((candidate) =>
      models.some((model) => model.slug === candidate)
    ) ?? profile.candidates.at(-1);
    const effort = effortOverride ?? (decision.tier === "max" && selected === "gpt-5.5" ? "xhigh" : profile.effort);
    const cached = models.find((model) => model.slug === selected);
    if (effort === "ultra" && !cached?.supportedReasoning.includes("ultra")) {
      throw new Error(`Codex model ${selected ?? "(unknown)"} does not advertise ultra reasoning.`);
    }
    if (
      effortOverride &&
      cached &&
      cached.supportedReasoning.length > 0 &&
      !cached.supportedReasoning.includes(effortOverride)
    ) {
      throw new Error(`Codex model ${selected ?? "(unknown)"} does not advertise ${effortOverride} reasoning.`);
    }
    return {
      ...decision,
      source: modelOverride || effortOverride ? "model_override" : decision.source,
      provider: provider.name,
      ...(selected ? { model: selected } : {}),
      effort
    };
  }

  return { ...decision, provider: provider.name };
};

export const applyRouteToLaunch = (launch: ProviderLaunch, route: AppliedRoute): ProviderLaunch => {
  if (!route.model) {
    return launch;
  }
  if (route.provider === "claude") {
    return {
      ...launch,
      args: ["--model", route.model, ...(route.effort ? ["--effort", route.effort] : []), ...launch.args]
    };
  }
  if (route.provider === "codex") {
    return {
      ...launch,
      args: [
        "--model",
        route.model,
        ...(route.effort ? ["-c", `model_reasoning_effort=\"${route.effort}\"`] : []),
        ...launch.args
      ]
    };
  }
  return launch;
};
