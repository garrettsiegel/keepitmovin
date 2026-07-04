import type { z } from "zod";
import type { codepassConfigSchema } from "./config.js";

export type ProviderName = string;

export type ProviderIntegrationType =
  | "pty"
  | "pty_with_bootstrap_input"
  | "headless"
  | "server"
  | "external_app"
  | "cloud_link"
  | "custom_command";

export type AgentErrorType =
  | "rate_limit"
  | "quota_exceeded"
  | "auth_error"
  | "timeout"
  | "command_not_found"
  | "manual_switch"
  | "nonzero_exit"
  | "unknown";

export interface ProviderConfig {
  name: ProviderName;
  enabled: boolean;
  command: string;
  args: string[];
  timeoutMs: number;
  fallbackOn?: AgentErrorType[];
}

export interface InteractiveProviderConfig {
  name: ProviderName;
  label: string;
  enabled: boolean;
  command: string;
  args: string[];
  handoffArgs: string[];
  integrationType: ProviderIntegrationType;
  bootstrapInput?: string;
  handoffBootstrapInput?: string;
  controllable?: boolean;
  fallbackOn?: AgentErrorType[];
}

export type CodePassConfig = z.infer<typeof codepassConfigSchema>;

export interface GitContext {
  isGitRepo: boolean;
  root?: string;
  statusShort: string;
  diffStat: string;
  diffNameOnly: string;
  recentDiff: string;
  changedFiles: string[];
}

export interface TaskContext {
  task: string;
  cwd: string;
  repoContext: string;
  projectInstructions: string;
  previousAttemptSummary: string;
}

export interface AttemptSummary {
  provider: ProviderName;
  success: boolean;
  exitCode: number | null;
  durationMs: number;
  errorType?: AgentErrorType;
  stdout?: string;
  stderr?: string;
  changedFiles: string[];
}

export interface ProviderResult {
  provider: ProviderName;
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  errorType?: AgentErrorType;
  changedFiles: string[];
}

export interface ProviderRunOptions {
  cwd: string;
  prompt: string;
}

export interface RunOptions {
  cwd: string;
  configPath?: string;
  dryRun: boolean;
  provider?: ProviderName;
  maxRetries?: number;
  onAttemptStart?: (provider: ProviderName, retryIndex: number) => void;
  onAttemptEnd?: (attempt: RunAttemptLog) => void;
}

export interface RunAttemptLog extends ProviderResult {
  prompt: string;
  startedAt: string;
  endedAt: string;
}

export interface RunLog {
  task: string;
  cwd: string;
  configPath?: string;
  startedAt: string;
  endedAt: string;
  providerOrder: ProviderName[];
  providersTried: ProviderName[];
  finalProvider?: ProviderName;
  success: boolean;
  dryRun: boolean;
  changedFiles: string[];
  attempts: RunAttemptLog[];
}

export interface RunSummary {
  task: string;
  cwd: string;
  success: boolean;
  dryRun: boolean;
  providerOrder: ProviderName[];
  providersTried: ProviderName[];
  finalProvider?: ProviderName;
  changedFiles: string[];
  attempts: RunAttemptLog[];
  logPath?: string;
}

export interface HarnessAttemptLog {
  provider: ProviderName;
  label: string;
  command: string;
  args: string[];
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  errorType?: AgentErrorType;
  transcriptExcerpt: string;
}

export interface HarnessSessionLog {
  cwd: string;
  startedAt: string;
  endedAt: string;
  providerOrder: ProviderName[];
  attempts: HarnessAttemptLog[];
  finalProvider?: ProviderName;
  success: boolean;
  changedFiles: string[];
  sessionLogPath?: string;
}
