import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  getDefaultInteractiveProviders,
  getDefaultProviderOrder,
  mergeCatalogInteractiveProviders
} from "./provider-catalog.js";
import type { AgentErrorType, CodePassConfig } from "./types.js";

export const DEFAULT_CONFIG_FILE = "codepass.config.json";
export const DEFAULT_CODEPASS_DIR = ".codepass";
export const DEFAULT_RUNS_DIR = ".codepass/runs";
export const DEFAULT_LOGS_DIR = ".codepass/logs";
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
  fallbackOn: z.array(agentErrorTypeSchema).optional()
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
    runsDir: z.string().default(DEFAULT_RUNS_DIR),
    logsDir: z.string().default(DEFAULT_LOGS_DIR),
    sessionsDir: z.string().default(DEFAULT_SESSIONS_DIR)
  }).default({
    runsDir: DEFAULT_RUNS_DIR,
    logsDir: DEFAULT_LOGS_DIR,
    sessionsDir: DEFAULT_SESSIONS_DIR
  }),
  updates: z.object({
    checkOnStart: z.boolean().default(true),
    mode: updateModeSchema.default("always"),
    includeDisabledProviders: z.boolean().default(false)
  }).default({
    checkOnStart: true,
    mode: "always",
    includeDisabledProviders: false
  }),
  harness: z.object({
    setupComplete: z.boolean().default(false),
    providerOrder: z.array(z.string()).default(getDefaultProviderOrder()),
    transcriptLimitChars: z.number().int().positive().default(DEFAULT_TRANSCRIPT_LIMIT_CHARS),
    handoffPath: z.string().default(DEFAULT_HANDOFF_PATH),
    handoffArchiveDir: z.string().default(DEFAULT_HANDOFF_ARCHIVE_DIR),
    manualSwitchKey: z.string().default("ctrl-]"),
    idleTimeoutMs: z.number().int().min(0).default(0),
    autoAppendCheckpoints: z.boolean().default(true),
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
    providers: getDefaultInteractiveProviders()
  })
});

const normalizeConfig = (config: CodePassConfig): CodePassConfig => codepassConfigSchema.parse({
  ...config,
  harness: {
    ...config.harness,
    providers: mergeCatalogInteractiveProviders(config.harness.providers)
  }
});

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
  await mkdir(path.join(cwd, DEFAULT_RUNS_DIR), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_LOGS_DIR), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_SESSIONS_DIR), { recursive: true });
  await mkdir(path.dirname(path.join(cwd, DEFAULT_HANDOFF_PATH)), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_HANDOFF_ARCHIVE_DIR), { recursive: true });

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
  await mkdir(path.join(cwd, DEFAULT_RUNS_DIR), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_LOGS_DIR), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_SESSIONS_DIR), { recursive: true });
  await mkdir(path.dirname(path.join(cwd, DEFAULT_HANDOFF_PATH)), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_HANDOFF_ARCHIVE_DIR), { recursive: true });
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
