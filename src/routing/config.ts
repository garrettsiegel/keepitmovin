import { z } from "zod";

export const routingTierSchema = z.enum(["light", "standard", "deep", "max"]);
export const reasoningEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]);

export const DEFAULT_ROUTING_CONFIG = {
  enabled: false,
  promptForTask: true,
  allowOverride: true,
  askOutcome: true,
  telemetry: true
} as const;

export const routingConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_ROUTING_CONFIG.enabled),
  promptForTask: z.boolean().default(DEFAULT_ROUTING_CONFIG.promptForTask),
  allowOverride: z.boolean().default(DEFAULT_ROUTING_CONFIG.allowOverride),
  askOutcome: z.boolean().default(DEFAULT_ROUTING_CONFIG.askOutcome),
  telemetry: z.boolean().default(DEFAULT_ROUTING_CONFIG.telemetry)
}).default(DEFAULT_ROUTING_CONFIG);
