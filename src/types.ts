import type { z } from "zod";
import type { keepitmovinConfigSchema } from "./config.js";

export type ProviderName = string;

export type RoutingTier = "light" | "standard" | "deep" | "max";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type SessionOutcome = "completed" | "partial" | "failed" | "abandoned" | "unknown";

export interface RouteDecision {
  tier: RoutingTier;
  reason: string;
  signals: string[];
  source: "classifier" | "tier_override" | "model_override";
}

export interface AppliedRoute extends RouteDecision {
  provider: ProviderName;
  model?: string;
  effort?: ReasoningEffort;
}

export interface HandoffQuality {
  taskInitialized: boolean;
  narrativeUpdated: boolean;
  missingSections: string[];
  placeholdersRemaining: string[];
}

export interface HandoffReceiptLog {
  status: "received" | "missing" | "not_applicable";
  receivedAt?: string;
  restatedGoal?: string;
  nextAction?: string;
}

export interface CompactionEventLog {
  provider: ProviderName;
  detectedAt: string;
  source: "claude-transcript" | "codex-session-files";
}

export interface WatchdogEventLog {
  type: "loop" | "burn" | "stall";
  provider: ProviderName;
  detectedAt: string;
  detail: string;
}

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
  | "aborted"
  | "nonzero_exit"
  | "unknown";

// How keepitmovin reads a tool's own local usage/limit state. Only one kind exists
// today; widen UsageProbeKind to a union when another tool exposes headroom data.
export type UsageProbeKind = "codex-session-files";
export type CompactionProbeKind = "claude-transcript" | "codex-session-files";

export interface UsageProbeSpec {
  kind: UsageProbeKind;
  // Overrides harness.usageProbe.thresholdPercent for this provider only.
  thresholdPercent?: number;
}

export interface CompactionProbeSpec {
  kind: CompactionProbeKind;
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
  // Exact, tool-emitted rate/usage-limit banners for this provider. Matched during
  // live detection when they head a status-like line (see
  // failure-detection.ts:detectLiveFailure).
  limitPatterns?: string[];
  // Optional local-file usage probe (see usage-probe.ts). Absent for tools with
  // no readable headroom state (e.g. Claude Code today).
  usageProbe?: UsageProbeSpec;
  compactionProbe?: CompactionProbeSpec;
}

export type KeepitmovinConfig = z.infer<typeof keepitmovinConfigSchema>;

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
  // Human-readable detail for errorType, e.g. the usage-probe message
  // ("Codex is at 96% of its weekly limit"). Shown in handoff checkpoints.
  errorDetail?: string;
  transcriptExcerpt: string;
  route?: AppliedRoute;
  handoffReceipt?: HandoffReceiptLog;
  compactionEvents?: CompactionEventLog[];
  watchdogEvents?: WatchdogEventLog[];
}

export interface HarnessSessionLog {
  cwd: string;
  startedAt: string;
  endedAt: string;
  providerOrder: ProviderName[];
  attempts: HarnessAttemptLog[];
  finalProvider?: ProviderName;
  success: boolean;
  /** True when the user stopped the session with Ctrl-C / SIGTERM. */
  aborted?: boolean;
  changedFiles: string[];
  sessionLogPath?: string;
  task?: string;
  routeDecision?: RouteDecision;
  outcome?: SessionOutcome;
  handoffQuality?: HandoffQuality;
}
