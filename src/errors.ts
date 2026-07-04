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
  "permission denied",
  "authentication failed",
  "no saved credentials"
];

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

  const output = `${stdout}\n${stderr}`.toLowerCase();

  if (QUOTA_PATTERNS.some((pattern) => output.includes(pattern))) {
    return "quota_exceeded";
  }

  if (RATE_LIMIT_PATTERNS.some((pattern) => output.includes(pattern))) {
    return "rate_limit";
  }

  if (AUTH_PATTERNS.some((pattern) => output.includes(pattern))) {
    return "auth_error";
  }

  if (exitCode !== null) {
    return "nonzero_exit";
  }

  return "unknown";
};
