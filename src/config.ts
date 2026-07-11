import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ensureArtifactsIgnored } from "./artifacts.js";
import {
  getDefaultInteractiveProviders,
  getDefaultProviderOrder,
  mergeCatalogInteractiveProviders,
  reconcileProviderOrder
} from "./provider-catalog.js";
import type { AgentErrorType, CodePassConfig } from "./types.js";
import { routingConfigSchema } from "./routing-config.js";

export const DEFAULT_CONFIG_FILE = "codepass.config.json";
export const DEFAULT_CODEPASS_DIR = ".codepass";
export const DEFAULT_SESSIONS_DIR = ".codepass/sessions";
export const DEFAULT_HANDOFF_PATH = ".codepass/current/handoff.md";
export const DEFAULT_HANDOFF_ARCHIVE_DIR = ".codepass/handoffs";
export const DEFAULT_TRANSCRIPT_LIMIT_CHARS = 80_000;

export const agentErrorTypeSchema = z.enum([
  "rate_limit",
  "quota_exceeded",
  "auth_error",
  "timeout",
  "command_not_found",
  "manual_switch",
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
  usageProbe: usageProbeSpecSchema.optional()
});

export const codepassConfigSchema = z.object({
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
  }).default({
    maxDiffChars: 20_000
  }),
  logs: z.object({
    sessionsDir: z.string().default(DEFAULT_SESSIONS_DIR)
  }).default({
    sessionsDir: DEFAULT_SESSIONS_DIR
  }),
  updates: z.object({
    checkOnStart: z.boolean().default(true),
    mode: updateModeSchema.default("prompt"),
    includeDisabledProviders: z.boolean().default(false)
  }).default({
    checkOnStart: true,
    mode: "prompt",
    includeDisabledProviders: false
  }),
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
      .default({ enabled: true, thresholdPercent: 95, pollIntervalMs: 30_000 }),
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
          .default({
            enabled: true,
            staleAfterMs: 300_000,
            idleForMs: 10_000,
            minTranscriptGrowthChars: 2_000
          })
      })
      .default({
        enabled: true,
        intervalMs: 60_000,
        nudge: {
          enabled: true,
          staleAfterMs: 300_000,
          idleForMs: 10_000,
          minTranscriptGrowthChars: 2_000
        }
      }),
    providers: z.array(interactiveProviderConfigSchema).default(getDefaultInteractiveProviders())
  }).default({
    setupComplete: false,
    providerOrder: getDefaultProviderOrder(),
    transcriptLimitChars: DEFAULT_TRANSCRIPT_LIMIT_CHARS,
    handoffPath: DEFAULT_HANDOFF_PATH,
    handoffArchiveDir: DEFAULT_HANDOFF_ARCHIVE_DIR,
    manualSwitchKey: "ctrl-]",
    idleTimeoutMs: 0,
    autoAppendCheckpoints: true,
    usageProbe: { enabled: true, thresholdPercent: 95, pollIntervalMs: 30_000 },
    handoffRefresh: {
      enabled: true,
      intervalMs: 60_000,
      nudge: {
        enabled: true,
        staleAfterMs: 300_000,
        idleForMs: 10_000,
        minTranscriptGrowthChars: 2_000
      }
    },
    providers: getDefaultInteractiveProviders()
  })
});

/**
 * Writes the `.codepass/.gitignore` marker so handoff files and session logs
 * (which contain terminal output and git diffs) never get committed to the
 * user's repo. Prints a one-time notice when it first creates the marker.
 */
export const ensureCodepassIgnored = async (cwd: string): Promise<void> => {
  const created = await ensureArtifactsIgnored(path.join(cwd, DEFAULT_CODEPASS_DIR));
  if (created) {
    console.log(
      "CodePass: added .codepass/.gitignore so local handoff and session artifacts stay out of git."
    );
  }
};

const normalizeConfig = (config: CodePassConfig): CodePassConfig => {
  const providers = mergeCatalogInteractiveProviders(config.harness.providers);
  return codepassConfigSchema.parse({
    ...config,
    harness: {
      ...config.harness,
      providers,
      providerOrder: reconcileProviderOrder(
        config.harness.providers,
        providers,
        config.harness.providerOrder
      )
    }
  });
};

export const defaultConfig = (): CodePassConfig => normalizeConfig(codepassConfigSchema.parse({}));

export const resolveConfigPath = (cwd: string, configPath?: string): string => {
  if (!configPath) {
    return path.join(cwd, DEFAULT_CONFIG_FILE);
  }

  return path.isAbsolute(configPath) ? configPath : path.join(cwd, configPath);
};

export const loadConfig = async (
  cwd: string,
  configPath?: string
): Promise<{ config: CodePassConfig; path?: string }> => {
  const resolvedPath = resolveConfigPath(cwd, configPath);

  try {
    await access(resolvedPath);
  } catch {
    if (configPath) {
      throw new Error(`CodePass config not found: ${resolvedPath}`);
    }

    return { config: defaultConfig() };
  }

  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return { config: normalizeConfig(codepassConfigSchema.parse(parsed)), path: resolvedPath };
};

export const initConfig = async (
  cwd: string,
  configPath?: string
): Promise<{ configPath: string; createdConfig: boolean }> => {
  const resolvedPath = resolveConfigPath(cwd, configPath);
  let createdConfig = false;

  await mkdir(path.join(cwd, DEFAULT_CODEPASS_DIR), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_SESSIONS_DIR), { recursive: true });
  await mkdir(path.dirname(path.join(cwd, DEFAULT_HANDOFF_PATH)), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_HANDOFF_ARCHIVE_DIR), { recursive: true });
  await ensureCodepassIgnored(cwd);

  try {
    await access(resolvedPath);
  } catch {
    await writeFile(
      resolvedPath,
      `${JSON.stringify(defaultConfig(), null, 2)}\n`,
      "utf8"
    );
    createdConfig = true;
  }

  return { configPath: resolvedPath, createdConfig };
};

export const saveConfig = async (
  cwd: string,
  config: CodePassConfig,
  configPath?: string
): Promise<string> => {
  const resolvedPath = resolveConfigPath(cwd, configPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_CODEPASS_DIR), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_SESSIONS_DIR), { recursive: true });
  await mkdir(path.dirname(path.join(cwd, DEFAULT_HANDOFF_PATH)), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_HANDOFF_ARCHIVE_DIR), { recursive: true });
  await ensureCodepassIgnored(cwd);
  await writeFile(
    resolvedPath,
    `${JSON.stringify(codepassConfigSchema.parse(config), null, 2)}\n`,
    "utf8"
  );
  return resolvedPath;
};

export const isFallbackEligible = (
  errorType: AgentErrorType | undefined,
  configFallbackOn: AgentErrorType[],
  providerFallbackOn?: AgentErrorType[]
): boolean => {
  if (!errorType) {
    return false;
  }

  return (providerFallbackOn ?? configFallbackOn).includes(errorType);
};
