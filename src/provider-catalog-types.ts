import type { ProviderIntegrationType, UsageProbeSpec } from "./types.js";

export type ProviderCatalogGroup = "harness" | "guided";

export interface ProviderCommandSpec {
  label: string;
  command: string;
  args: string[];
}

export interface ProviderCatalogEntry {
  name: string;
  label: string;
  group: ProviderCatalogGroup;
  integrationType: ProviderIntegrationType;
  command?: string;
  versionArgs?: string[];
  defaultEnabled: boolean;
  controllable: boolean;
  args?: string[];
  handoffArgs?: string[];
  bootstrapInput?: string;
  handoffBootstrapInput?: string;
  // Exact rate/usage-limit banners this tool prints when it blocks. Kept specific
  // enough that they cannot appear in an agent's ordinary prose — see
  // failure-detection.ts:detectLiveFailure.
  limitPatterns?: string[];
  // Local-file usage probe for this tool, if it writes readable headroom state.
  // Codex: rollout JSONLs under ~/.codex/sessions. Claude Code has none today.
  usageProbe?: UsageProbeSpec;
  installCommands?: ProviderCommandSpec[];
  updateCommands?: ProviderCommandSpec[];
  install: string;
  auth: string;
  homepage: string;
  summary: string;
  limitation?: string;
  deprecated?: boolean;
  replacement?: string;
}

export const DEFAULT_SESSION_ARGS = ["{{sessionPrompt}}"];
export const DEFAULT_HANDOFF_ARGS = ["{{handoffPrompt}}"];
// Single-line bootstrap pastes are more reliable than multi-line session prompts:
// TUI/REPL tools often treat each `\n` as submit, so a full handoff paragraph would
// become many partial turns. The handoff file already holds the full continuity text.
export const DEFAULT_BOOTSTRAP =
  "Read the CodePass handoff at {{handoffPath}} and continue the session (keep that file updated as you work).\n";
export const DEFAULT_HANDOFF_BOOTSTRAP =
  "Read the CodePass handoff at {{handoffPath}} first, then continue from where the previous tool left off.\n";
// Inline bootstrap for plain chat REPLs (e.g. Ollama) that have NO filesystem
// access: they cannot open the handoff file, so the task/continuation text must
// be pasted directly rather than pointing at {{handoffPath}}.
export const INLINE_SESSION_BOOTSTRAP = "{{sessionPrompt}}\n";
export const INLINE_HANDOFF_BOOTSTRAP = "{{handoffPrompt}}\n";
