import { z } from "zod";

export const routingTierSchema = z.enum(["light", "standard", "deep", "max"]);
export const reasoningEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]);

export const DEFAULT_ROUTING_CONFIG = {
  enabled: false
} as const;

// One switch. The old sub-flags (promptForTask, allowOverride, askOutcome,
// telemetry) each gated a prompt that no longer exists.
export const routingConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_ROUTING_CONFIG.enabled)
}).prefault({});
