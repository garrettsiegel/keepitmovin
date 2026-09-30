import type { AgentErrorType } from "../config/types.js";

const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "rate_limit",
  "too many requests",
  "usage limit",
  "limit reached",
  "session limit",
  "overloaded",
  // "at capacity" wording, generic across tools (e.g. Claude Code's "Selected
  // model is at capacity", "servers are over capacity"). Kept as phrases rather
  // than the bare word "capacity" so benign lines like "reached disk capacity"
  // don't trip the status-word branch of the prose guard.
  "at capacity",
  "over capacity",
  "at full capacity"
];

const QUOTA_PATTERNS = [
  "quota exceeded",
  "quota_exceeded",
  "insufficient quota",
  // OpenAI's quota/billing error code, passed through raw by several tools.
  "insufficient_quota",
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

  // An exhaustion word means the limit was actually HIT, whatever percentage the
  // line also quotes. Without this, a real banner that reports its own usage
  // ("Rate limit reached — 87% of quota consumed") was dismissed as a warning
  // and keepitmovin never switched.
  if (LIMIT_HIT_TOKEN.test(lower)) {
    return false;
  }

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

/**
 * Words that mean a limit was actually hit rather than approached. A line
 * carrying one of these is never suppressed as a usage warning.
 */
const LIMIT_HIT_TOKEN =
  /\b(?:reached|exceeded|blocked|throttled|out of credits|no quota|quota_exceeded)\b/;

export const carriesLimitHit = (line: string): boolean => LIMIT_HIT_TOKEN.test(line.toLowerCase());

/**
 * Whether `line` should be skipped as an "approaching your limit" notice.
 *
 * TUIs wrap one logical row across several real lines, so the percentage and the
 * word "limit" can land separately — the previous line is folded in as context to
 * catch that. But the folded context must never *veto an unrelated line*: Claude
 * Code renders "Context left until auto-compact: 23%" directly above its status
 * output, which silently suppressed a genuine "usage limit reached" banner on the
 * following line. So a line that carries an exhaustion word of its own is always
 * judged on its own merits.
 */
export const isSuppressedUsageWarning = (line: string, previousLine?: string): boolean => {
  if (isUsageWarning(line)) {
    return true;
  }

  if (previousLine === undefined || carriesLimitHit(line)) {
    return false;
  }

  return isUsageWarning(`${previousLine} ${line}`);
};

// Remove lines that read as usage-percentage warnings before pattern matching,
// so an "approaching your limit" notice on screen at exit isn't classified as a
// real limit. The previous line is folded into each line's context because TUIs
// wrap the warning across rows (the figure and "limit" land on separate lines).
const stripUsageWarnings = (text: string): string => {
  const lines = text.split("\n");
  return lines
    .filter((line, index) => !isSuppressedUsageWarning(line, index > 0 ? lines[index - 1] : undefined))
    .join("\n");
};

/**
 * Ordered pattern groups for the limit/quota/auth families keepitmovin can detect from
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
    // Checked before the phrase list so "429 Too Many Requests" reports the
    // whole status as its pattern — the prose guard needs to see it head the line.
    const http429 = group.type === "rate_limit" ? matchHttp429(lower) : undefined;
    if (http429) {
      return { type: "rate_limit", pattern: http429 };
    }
    const pattern = group.patterns.find((candidate) => lower.includes(candidate));
    if (pattern) {
      return { type: group.type, pattern };
    }
  }

  return undefined;
};

/**
 * The HTTP 429 status in `text` (already lowercased), returned as the matched
 * text so the prose guard can check it heads its line. A bare "429" substring
 * used to be a rate-limit pattern, which matched line numbers and byte counts
 * ("Error: foo.ts:1429") — and since that line starts with "error", the prose
 * guard trusted it and forced a switch.
 *
 * Requires `429` as a whole number (not in 1429, 4290, or 0.429) with HTTP
 * context touching it: "status: 429", "status code 429", "HTTP/1.1 429",
 * "API Error: 429", "code=429", or the reason phrase "429 Too Many Requests".
 * The context word must sit right beside the number, so "Error: read 429
 * bytes" and "line 429" stay unmatched. A bare "429 upstream" with no context
 * is a deliberate miss: a false switch costs more than a late one.
 */
const HTTP_429 =
  /\b(?:status(?: code)?|http(?:\/[\d.]+)?|error|code)[\s:=(#]{0,3}429(?![\d.])|(?<![\d.])429\s*[-:]?\s*too many requests/;

const matchHttp429 = (text: string): string | undefined => text.match(HTTP_429)?.[0];

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

  const match = matchLimitPattern(output);
  if (match) {
    return match.type;
  }

  if (AUTH_EXIT_ONLY_PATTERNS.some((pattern) => output.includes(pattern))) {
    return "auth_error";
  }

  if (exitCode !== null) {
    return "nonzero_exit";
  }

  return "unknown";
};
