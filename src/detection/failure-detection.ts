import {
  classifyError,
  isSuppressedUsageWarning,
  matchLimitPattern,
  matchProviderLimitPattern
} from "./errors.js";
import { DEFAULT_FALLBACK_ON, type MANUAL_SWITCH_KEYS } from "../config/config-schema.js";
import type { AgentErrorType, InteractiveProviderConfig, KeepitmovinConfig } from "../config/types.js";

// Control sequences for the supported manual-switch keys. Values are the raw
// bytes a terminal emits for each chord.
const MANUAL_SWITCH_SEQUENCES: Record<(typeof MANUAL_SWITCH_KEYS)[number], string> = {
  "ctrl-]": "\x1d",
  "ctrl-\\": "\x1c",
  "ctrl-g": "\x07",
  "ctrl-o": "\x0f"
};

export const getManualSwitchSequence = (config: KeepitmovinConfig): string =>
  MANUAL_SWITCH_SEQUENCES[config.harness.manualSwitchKey];

/** "ctrl-]" → "Ctrl+]", for on-screen hints. */
export const formatManualSwitchKey = (config: KeepitmovinConfig): string =>
  config.harness.manualSwitchKey.replace(/^ctrl-(.)$/, (_, key: string) => `Ctrl+${key.toUpperCase()}`);

// Prefixes that mark a line as a tool/status/error line rather than the agent's
// prose. A limit pattern is only trusted live when it heads its line or the line
// starts with one of these.
const ERROR_LINE_INDICATORS = [
  "error",
  "err:",
  "fatal",
  "failed",
  "request failed",
  // Grok Build renders a rate-limit line as "Retry failed: <message>" — the
  // message (not the prefix) carries the banner, so the prefix must count as a
  // status indicator for the guard to trust the line.
  "retry failed",
  "api error",
  "http error",
  // Kimi's legacy Python CLI heads a 429/5xx line with "LLM provider error:".
  "llm provider error",
  "status:",
  "warn:",
  "warning:",
  "✗",
  "✘",
  // Qwen Code prefixes every error line with U+2715.
  "✕",
  "×",
  "⚠",
  "⛔",
  "🚫",
  "❌",
  "⏳",
  "❗",
  "‼",
  "[error]",
  "[warn]",
  "[warning]"
];

// Words that signal a definitive status event (not prose discussion) when they
// sit *next to* a limit pattern. Handles tool-generated messages like
// "Claude usage limit reached." that lack a technical error prefix.
//
// These must never be matched as bare substrings anywhere on the line. Doing so
// made ordinary agent prose force a handoff: "hit" is a substring of
// "w-hit-espace", so "normalize whitespace before checking the rate limit string"
// read as a status line, as did "if we hit the rate limit we should back off".
const STATUS_WORD = /^(?:reached|exceeded|exceeds|exceed|encountered|triggered|detected|hit)$/;

// How far from the matched pattern a status word is still considered part of the
// same status phrase. A banner reads "<pattern> reached", never
// "<status word> … five words … <pattern>".
const STATUS_WORDS_AFTER = 3;

// A status word may also *precede* the pattern ("You've hit your session limit"),
// but only when the banner ends there. Prose that leads with a status word keeps
// going into a clause ("if we hit the rate limit we should back off"), so a
// trailing tail is what separates the two.
const STATUS_WORDS_BEFORE = 2;
const MAX_TRAILING_TOKENS_FOR_LEADING_STATUS = 1;

const tokenize = (text: string): string[] => text.split(/[^a-z0-9]+/i).filter(Boolean);

const isStatusWord = (token: string): boolean => STATUS_WORD.test(token);

// True when a status word sits immediately around `pattern` inside `line`.
const hasAdjacentStatusWord = (line: string, pattern: string): boolean => {
  const index = line.indexOf(pattern);
  if (index === -1) {
    return false;
  }

  const after = tokenize(line.slice(index + pattern.length));
  if (after.slice(0, STATUS_WORDS_AFTER).some(isStatusWord)) {
    return true;
  }

  if (after.length > MAX_TRAILING_TOKENS_FOR_LEADING_STATUS) {
    return false;
  }

  return tokenize(line.slice(0, index)).slice(-STATUS_WORDS_BEFORE).some(isStatusWord);
};

// The prompts keepitmovin injects embed the error type verbatim ("rate_limit" is
// itself a pattern), so a tool that echoes its prompt could self-trigger an
// immediate re-switch unless the echo is stripped. An exact match isn't enough:
// PTY output carries CRLF where the prompt has LF, and a TUI re-wraps a pasted
// prompt at terminal width. So the prompt matches with any run of whitespace
// (including line breaks) between its words.
const normalizeLineEndings = (text: string): string => text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wrapTolerantPattern = (value: string): RegExp | undefined => {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > 0 ? new RegExp(words.map(escapeRegExp).join("\\s+"), "g") : undefined;
};

const stripIgnored = (text: string, ignore: Array<string | undefined>): string =>
  ignore
    .map((value) => (value ? wrapTolerantPattern(value) : undefined))
    .filter((pattern): pattern is RegExp => Boolean(pattern))
    .reduce((accumulated, pattern) => accumulated.replace(pattern, ""), normalizeLineEndings(text));

// TUI dialogs (Amp's "Out of Credits", Droid's "Credit Limit Reached") draw their
// text inside box borders, so a banner never literally heads its line. Strip the
// box-drawing side borders first. The ASCII "|" is deliberately not stripped:
// agents print Markdown tables, and a cell must not pass as a status line.
const stripBoxBorders = (line: string): string =>
  line.replace(/^[│┃║]\s*/, "").replace(/\s*[│┃║]$/, "");

// True when `line` contains `pattern` in a way that reads like a status/error
// line — either the line leads with the pattern itself, or with a known error
// indicator. This is what stops keepitmovin from switching when an agent merely
// *mentions* a rate limit in ordinary prose.
//
// `strict` omits the loose "line contains a status word anywhere" branch. Use it
// for provider `limitPatterns` (exact tool banners): a real banner heads its own
// line, so requiring that avoids switching on an agent's prose that merely quotes
// the banner alongside a word like "reached" or "hit".
const isStatusLikeLine = (
  line: string,
  pattern: string,
  options: { strict?: boolean } = {}
): boolean => {
  const trimmed = stripBoxBorders(line.trim()).toLowerCase();

  if (!trimmed.includes(pattern)) {
    return false;
  }

  if (trimmed.startsWith(pattern)) {
    return true;
  }

  if (ERROR_LINE_INDICATORS.some((indicator) => trimmed.startsWith(indicator))) {
    return true;
  }

  const withoutPrefix = trimmed.replace(/^[[(][^\])]*[\])]\s*/, "");
  if (withoutPrefix !== trimmed) {
    if (
      withoutPrefix.startsWith(pattern) ||
      ERROR_LINE_INDICATORS.some((indicator) => withoutPrefix.startsWith(indicator))
    ) {
      return true;
    }
  }

  // A limit pattern with a status word right beside it (e.g. "usage limit
  // reached") is a definitive status event, not prose discussion. Skipped in
  // strict mode.
  if (!options.strict && hasAdjacentStatusWord(trimmed, pattern)) {
    return true;
  }

  return false;
};

// Live (still-running) detection. Scoped to the transcript tail with the prompts
// stripped. Both the generic patterns and a provider's curated `limitPatterns`
// (exact tool banners) must appear on a status-like line — the banner path uses
// the stricter guard, so an agent merely quoting a banner in prose won't switch.
export const detectLiveFailure = (
  tail: string,
  provider: InteractiveProviderConfig,
  ignore: Array<string | undefined>
): AgentErrorType | undefined => {
  const cleaned = stripIgnored(tail, ignore);
  const fallbackOn = provider.fallbackOn ?? DEFAULT_FALLBACK_ON;
  let previousLine: string | undefined;

  for (const line of cleaned.split("\n")) {
    // Percentage "approaching your limit" warnings wrap across TUI rows, so the
    // figure can sit on the previous line while a limit pattern heads this one.
    // These are not limit-hit events (e.g. "You've used 92% of your session
    // limit") and neither pattern layer may fire on them. A line carrying its own
    // exhaustion word is exempt — see isSuppressedUsageWarning.
    const suppressed = isSuppressedUsageWarning(line, previousLine);
    previousLine = line;

    if (suppressed) {
      continue;
    }

    const banner = matchProviderLimitPattern(line, provider.limitPatterns);
    if (
      fallbackOn.includes("rate_limit") &&
      banner &&
      isStatusLikeLine(line, banner.toLowerCase(), { strict: true })
    ) {
      return "rate_limit";
    }

    const match = matchLimitPattern(line);
    if (!match || !fallbackOn.includes(match.type)) {
      continue;
    }

    if (isStatusLikeLine(line, match.pattern)) {
      return match.type;
    }
  }

  return undefined;
};

// Post-exit detection. A non-zero exit is already a strong failure signal, so
// the whole transcript is checked with the live (status-line) guard, and the
// broader substring classifier runs only on the tail. Running the substring
// classifier over everything turned prose from early in the session ("the rate
// limit handler…") plus any failing exit into a bogus `rate_limit`.
export const detectExitFailure = (
  text: string,
  tail: string,
  provider: InteractiveProviderConfig,
  exitCode: number | null,
  ignore: Array<string | undefined>
): AgentErrorType | undefined => {
  const live = detectLiveFailure(text, provider, ignore);
  if (live) return live;

  const detected = classifyError(stripIgnored(tail, ignore), "", exitCode ?? 1);
  const fallbackOn = provider.fallbackOn ?? DEFAULT_FALLBACK_ON;

  return detected && fallbackOn.includes(detected) ? detected : undefined;
};
