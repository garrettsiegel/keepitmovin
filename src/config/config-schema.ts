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
  fallbackOn: z.array(agentErrorTypeSchema).default([
    "rate_limit",
    "quota_exceeded",
    "auth_error",
    "timeout",
    "command_not_found",
    "nonzero_exit"
  ]),
  context: z.object({
    maxDiffChars: z.number().int().positive().default(20_000)
  }).prefault({}),
  logs: z.object({
    sessionsDir: z.string().default(DEFAULT_SESSIONS_DIR)
  }).prefault({}),
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
    transcriptLimitChars: z.number().int().positive().default(DEFAULT_TRANSCRIPT_LIMIT_CHARS),
    handoffPath: z.string().default(DEFAULT_HANDOFF_PATH),
    handoffArchiveDir: z.string().default(DEFAULT_HANDOFF_ARCHIVE_DIR),
    manualSwitchKey: z.string().default("ctrl-]"),
    idleTimeoutMs: z.number().int().min(0).default(0),
    autoAppendCheckpoints: z.boolean().default(true),
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
        intervalMs: z.number().int().min(1_000).default(60_000),
        nudge: z
          .object({
            enabled: z.boolean().default(true),
            staleAfterMs: z.number().int().positive().default(300_000),
            idleForMs: z.number().int().positive().default(10_000),
            minTranscriptGrowthChars: z.number().int().positive().default(2_000)
          })
          .prefault({})
      })
      .prefault({}),
    watchdog: z.object({
      enabled: z.boolean().default(true),
      action: z.literal("warn").default("warn")
    }).prefault({}),
    providers: z.array(interactiveProviderConfigSchema).default(getDefaultInteractiveProviders())
  // Every field above carries its own .default(), so an absent `harness` key is
  // filled by parsing {}. Restating the whole tree here meant every default lived
  // in two places and had to be changed in both.
  }).prefault({})
});
