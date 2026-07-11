import type { AgentErrorType } from "./types.js";

const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "rate_limit",
  "too many requests",
  "429",
  "usage limit",
  "limit reached",
  "session limit",
  "overloaded"
];

const QUOTA_PATTERNS = [
  "quota exceeded",
  "quota_exceeded",
  "insufficient quota",
  "billing quota"
];

const AUTH_PATTERNS = [
  "unauthorized",
  "invalid api key",
  "not authenticated",
  "login required",
  // Bare "permission denied" is ordinary FS/OS noise from coding agents — do not
  // treat it as provider auth failure. Keep auth-specific collocates only.
  "authentication failed",
  "no saved credentials",
  "auth failed"
];

// Auth phrases that read as imperative prose and commonly *head* an agent's own
// advice line (e.g. "Please log in to the gh CLI and re-run"). The live detector's
// prose guard trusts any line that STARTS with a pattern, so these would force a
// mid-session switch on ordinary prose. Restrict them to the post-exit classifier,
// where a non-zero exit already confirms a real failure.
const AUTH_EXIT_ONLY_PATTERNS = [
  "please log in",
  "please login",
  "sign in required"
];

// A percentage between 1 and 99 (inclusive), with an optional decimal part.
// 0% and 100% are intentionally NOT matched: 100% is exhaustion, and 0% is
// treated as exhaustion too — only a partial figure reads as "approaching".
const USAGE_PERCENT = /\b[1-9]\d?(?:\.\d+)?\s*%/;

/**
 * True when `context` reads as an "approaching your limit" usage warning — a
 * 1–99% figure sitting in a usage/limit context, or an explicit
 * "approaching … limit" — rather than a limit-hit event. Coding-tool TUIs
 * (Claude Code, …) surface a percentage notice ("You've used 92% of your
 * session limit") that mentions the word "limit" but does NOT mean the tool is
 * blocked. Detection must never treat these as a real limit.
 */
export const isUsageWarning = (context: string): boolean => {
  const lower = context.toLowerCase();

  if (/\bapproaching\b[^.]*\blimit\b/.test(lower)) {
    return true;
  }

  if (!USAGE_PERCENT.test(lower)) {
    return false;
  }

  // A 1–99% figure only reads as a usage warning when it sits alongside
  // usage/limit language — an unrelated percentage shouldn't suppress detection.
  return (
    lower.includes("used") ||
    lower.includes("of your") ||
    lower.includes("left") ||
    lower.includes("remaining") ||
    lower.includes("limit")
  );
};

// Remove lines that read as usage-percentage warnings before pattern matching,
// so an "approaching your limit" notice on screen at exit isn't classified as a
// real limit. The previous line is folded into each line's context because TUIs
// wrap the warning across rows (the figure and "limit" land on separate lines).
const stripUsageWarnings = (text: string): string => {
  const lines = text.split("\n");
  return lines
    .filter((line, index) => {
      const context = index > 0 ? `${lines[index - 1]} ${line}` : line;
      return !isUsageWarning(context);
    })
    .join("\n");
};

/**
 * Ordered pattern groups for the limit/quota/auth families CodePass can detect from
 * text alone (no exit code). Quota is checked before rate limit so the more
 * specific classification wins. Used by the live harness detector.
 */
export const LIMIT_PATTERN_GROUPS: Array<{ type: AgentErrorType; patterns: string[] }> = [
  { type: "quota_exceeded", patterns: QUOTA_PATTERNS },
  { type: "rate_limit", patterns: RATE_LIMIT_PATTERNS },
  { type: "auth_error", patterns: AUTH_PATTERNS }
];

/**
 * Returns the first limit/quota/auth family whose pattern appears in `text`,
 * along with the matched pattern. Text-only — callers decide whether the match
 * is trustworthy (e.g. a non-zero exit, or a status-like line in the harness).
 */
export const matchLimitPattern = (
  text: string
): { type: AgentErrorType; pattern: string } | undefined => {
  const lower = text.toLowerCase();

  for (const group of LIMIT_PATTERN_GROUPS) {
    const pattern = group.patterns.find((candidate) => lower.includes(candidate));
    if (pattern) {
      return { type: group.type, pattern };
    }
  }

  return undefined;
};

/**
 * Returns the first provider-specific limit banner from `patterns` that appears
 * in `text`. These come from a tool's catalog entry (`limitPatterns`) — exact,
 * tool-emitted banners the maintainer has vouched for. The caller
 * (`detectLiveFailure`) still requires the match to land on a status-like line
 * (strict prose guard) before switching, so a banner quoted in an agent's prose
 * doesn't trip a handoff. A confirmed match means the provider is rate/usage
 * limited, so the caller classifies it as `rate_limit`.
 */
export const matchProviderLimitPattern = (
  text: string,
  patterns: string[] | undefined
): string | undefined => {
  if (!patterns || patterns.length === 0) {
    return undefined;
  }

  const lower = text.toLowerCase();
  return patterns.find((pattern) => lower.includes(pattern.toLowerCase()));
};

export const classifyError = (
  stdout: string,
  stderr: string,
  exitCode: number | null,
  options: { timedOut?: boolean; commandNotFound?: boolean } = {}
): AgentErrorType | undefined => {
  if (options.timedOut) {
    return "timeout";
  }

  if (options.commandNotFound) {
    return "command_not_found";
  }

  if (exitCode === 0) {
    return undefined;
  }

  const output = stripUsageWarnings(`${stdout}\n${stderr}`).toLowerCase();

  if (QUOTA_PATTERNS.some((pattern) => output.includes(pattern))) {
    return "quota_exceeded";
  }

  if (RATE_LIMIT_PATTERNS.some((pattern) => output.includes(pattern))) {
    return "rate_limit";
  }

  if (
    AUTH_PATTERNS.some((pattern) => output.includes(pattern)) ||
    AUTH_EXIT_ONLY_PATTERNS.some((pattern) => output.includes(pattern))
  ) {
    return "auth_error";
  }

  if (exitCode !== null) {
    return "nonzero_exit";
  }

  return "unknown";
};
