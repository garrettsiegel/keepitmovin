// Best-effort secret redaction for persisted artifacts (handoff files, session
// logs). Terminal transcripts and git diffs frequently echo credentials; this
// scrubs the well-known token shapes before keepitmovin writes them to disk. It is
// defense-in-depth, not a guarantee — novel or truncated secrets can slip
// through, so artifacts are still treated as sensitive (and gitignored).

interface RedactionRule {
  kind: string;
  pattern: RegExp;
  /** Replacement template; defaults to the whole match becoming the marker. */
  replace?: string;
}

// Ordered most-specific first so a token isn't partially matched by a broader
// rule. Each pattern is anchored to token-shaped boundaries to limit false
// positives on ordinary prose.
const RULES: RedactionRule[] = [
  { kind: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { kind: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { kind: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g },
  { kind: "github-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { kind: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "slack-token", pattern: /\bxox[bpars]-[A-Za-z0-9-]{10,}/g },
  { kind: "google-key", pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { kind: "stripe-key", pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: "sendgrid-key", pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g },
  { kind: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{30,}/g },
  { kind: "huggingface-token", pattern: /\bhf_[A-Za-z0-9]{30,}/g },
  { kind: "groq-key", pattern: /\bgsk_[A-Za-z0-9]{20,}/g },
  { kind: "xai-key", pattern: /\bxai-[A-Za-z0-9]{20,}/g },
  { kind: "openrouter-key", pattern: /\bsk-or-v1-[A-Za-z0-9]{20,}/g },
  { kind: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}/g },
  // A JWT's payload routinely carries identity and session claims in the clear.
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  // Connection strings embed the password inline; redact the credential pair
  // only, so the host stays legible for debugging.
  {
    kind: "url-credentials",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi,
    replace: "$1[REDACTED:url-credentials]@"
  },
  {
    kind: "private-key",
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g
  },
  // Last-resort catch-all for shapes above that no vendor rule knows: an
  // assignment whose NAME says secret. Keeps the name, drops the value. Runs last
  // so a recognized vendor token is labelled by its own rule first.
  {
    kind: "secret-assignment",
    pattern:
      /\b([A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS)\s*[=:]\s*)(?!\[REDACTED)["']?[A-Za-z0-9_\-./+=]{8,}["']?/gi,
    replace: "$1[REDACTED:secret-assignment]"
  }
];

/**
 * Replaces recognizable secrets in `text` with `[REDACTED:<kind>]`. Pure and
 * idempotent (a `[REDACTED:*]` marker contains no secret shapes, so re-running is
 * a no-op).
 */
export const redactSecrets = (text: string): string =>
  RULES.reduce(
    (accumulated, rule) =>
      accumulated.replace(rule.pattern, rule.replace ?? `[REDACTED:${rule.kind}]`),
    text
  );
