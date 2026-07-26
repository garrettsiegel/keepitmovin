import { z } from "zod";
import {
  getDefaultInteractiveProviders,
  getDefaultProviderOrder
} from "../providers/catalog.js";
import { routingConfigSchema } from "../routing/config.js";

// The configuration contract. Split out of config.ts to keep both files under the
// project's 250-LOC limit: this file is the schema and its defaults, config.ts is
// loading, saving and normalizing.

export const DEFAULT_CONFIG_FILE = "keepitmovin.config.json";
export const DEFAULT_KEEPITMOVIN_DIR = ".keepitmovin";
export const DEFAULT_SESSIONS_DIR = ".keepitmovin/sessions";
export const DEFAULT_HANDOFF_PATH = ".keepitmovin/current/handoff.md";
export const DEFAULT_HANDOFF_ARCHIVE_DIR = ".keepitmovin/handoffs";
export const DEFAULT_TRANSCRIPT_LIMIT_CHARS = 80_000;
export const DEFAULT_MAX_DIFF_CHARS = 20_000;

/**
 * Failures that hand off to the next tool. Per-provider `fallbackOn` overrides
 * this; there is deliberately no global knob, because two places expressing one
 * policy only ever produced configs that disagreed with themselves.
 */
export const DEFAULT_FALLBACK_ON: readonly z.infer<typeof agentErrorTypeSchema>[] = [
  "rate_limit",
  "quota_exceeded",
  "auth_error",
  "timeout",
  "command_not_found",
  "nonzero_exit"
];

/** How the stale-handoff nudge is paced. Not configurable — see handoffRefresh.enabled to turn it off. */
export const HANDOFF_NUDGE = {
  staleAfterMs: 300_000,
  idleForMs: 10_000,
  minTranscriptGrowthChars: 2_000
} as const;

export const agentErrorTypeSchema = z.enum([
  "rate_limit",
  "quota_exceeded",
  "auth_error",
  "timeout",
  "command_not_found",
  "manual_switch",
  "aborted",
  "nonzero_exit",
  "unknown"
]);

export const providerIntegrationTypeSchema = z.enum([
  "pty",
  "pty_with_bootstrap_input",
  "headless",
  "server",
  "external_app",
  "cloud_link",
  "custom_command"
]);

export const updateModeSchema = z.enum(["off", "prompt", "always"]);

export const usageProbeSpecSchema = z.object({
  kind: z.literal("codex-session-files"),
  thresholdPercent: z.number().min(1).max(100).optional()
});

export const compactionProbeSpecSchema = z.object({
  kind: z.enum(["claude-transcript", "codex-session-files"])
});

export const interactiveProviderConfigSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean().default(true),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  handoffArgs: z.array(z.string()).default(["{{handoffPrompt}}"]),
  integrationType: providerIntegrationTypeSchema.default("pty"),
  bootstrapInput: z.string().optional(),
  handoffBootstrapInput: z.string().optional(),
  controllable: z.boolean().optional(),
  fallbackOn: z.array(agentErrorTypeSchema).optional(),
  limitPatterns: z.array(z.string()).optional(),
  usageProbe: usageProbeSpecSchema.optional(),
  compactionProbe: compactionProbeSpecSchema.optional()
});

export const keepitmovinConfigSchema = z.object({
  updates: z.object({
    // Off by default: `kim` should reach your tool without asking anything.
    // Set `"checkOnStart": true` to have keepitmovin check for tool updates.
    checkOnStart: z.boolean().default(false),
    mode: updateModeSchema.default("prompt"),
    includeDisabledProviders: z.boolean().default(false)
  }).prefault({}),
  routing: routingConfigSchema,
  harness: z.object({
    setupComplete: z.boolean().default(false),
    providerOrder: z.array(z.string()).default(getDefaultProviderOrder()),
    manualSwitchKey: z.string().default("ctrl-]"),
    // 0 disables it. The only way out of a tool that has wedged without
    // printing anything keepitmovin can recognize, so it stays configurable.
    idleTimeoutMs: z.number().int().min(0).default(0),
    usageProbe: z
      .object({
        enabled: z.boolean().default(true),
        thresholdPercent: z.number().min(1).max(100).default(95),
        pollIntervalMs: z.number().int().positive().default(30_000)
      })
      .prefault({}),
    handoffRefresh: z
      .object({
        enabled: z.boolean().default(true),
        intervalMs: z.number().int().min(1_000).default(60_000)
      })
      .prefault({}),
    watchdog: z.object({
      enabled: z.boolean().default(true)
    }).prefault({}),
    providers: z.array(interactiveProviderConfigSchema).default(getDefaultInteractiveProviders())
  // Every field above carries its own .default(), so an absent `harness` key is
  // filled by parsing {}. Restating the whole tree here meant every default lived
  // in two places and had to be changed in both.
  }).prefault({})
});
