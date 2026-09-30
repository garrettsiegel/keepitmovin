import { z } from "zod";

export const routingTierSchema = z.enum(["light", "standard", "deep", "max"]);
export const reasoningEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]);

export const DEFAULT_ROUTING_CONFIG = {
  enabled: false,
  classifier: "local"
} as const;

export const routingConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_ROUTING_CONFIG.enabled),
  // Jev sends sanitized task text to TypeSafe, so choosing it belongs to each user.
  classifier: z.enum(["local", "jev"]).default(DEFAULT_ROUTING_CONFIG.classifier)
}).prefault({});
