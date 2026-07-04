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
  // Exact, tool-emitted rate/usage-limit banners for this provider. Trusted on a
  // direct match during live detection (see harness.ts:detectLiveFailure).
  limitPatterns?: string[];
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
