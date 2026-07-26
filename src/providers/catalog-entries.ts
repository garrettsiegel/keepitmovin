import { SUPPORTED_MORE_CATALOG } from "./catalog-entries-continued.js";
import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_HANDOFF_ARGS,
  DEFAULT_HANDOFF_BOOTSTRAP,
  DEFAULT_SESSION_ARGS,
  type ProviderCatalogEntry
} from "./catalog-types.js";

export {
  DEFAULT_HANDOFF_ARGS,
  type ProviderCatalogEntry,
  type ProviderCatalogGroup,
  type ProviderCommandSpec
} from "./catalog-types.js";

// Fully-supported tools, part 1. The rest live in provider-catalog-more.ts;
// hidden/opt-in tools live in provider-catalog-extra.ts. Split only to keep each
// file under the 250 LOC limit — catalog order here drives the default fallback
// chain (claude → codex → kimi → antigravity → opencode → grok → cursor →
// copilot → ollama), so keep entries in the intended order.
const SUPPORTED_CORE_CATALOG: ProviderCatalogEntry[] = [
  {
    name: "claude",
    label: "Claude Code",
    group: "harness",
    integrationType: "pty",
    command: "claude",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    args: DEFAULT_SESSION_ARGS,
    handoffArgs: DEFAULT_HANDOFF_ARGS,
    compactionProbe: { kind: "claude-transcript" },
    limitPatterns: [
      "5-hour limit reached",
      "upgrade to increase your usage limit",
      "you've reached your usage limit",
      "selected model is at capacity"
    ],
    install: "Install Claude Code, then run `claude auth`.",
    auth: "Run `claude auth` and follow the browser login.",
    updateCommands: [
      {
        label: "Check for Claude Code updates",
        command: "claude",
        args: ["update"]
      }
    ],
    homepage: "https://code.claude.com/",
    summary: "Terminal-native coding agent from Anthropic."
  },
  {
    name: "codex",
    label: "Codex",
    group: "harness",
    integrationType: "pty",
    command: "codex",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    args: DEFAULT_SESSION_ARGS,
    handoffArgs: DEFAULT_HANDOFF_ARGS,
    limitPatterns: [
      "you've hit your usage limit",
      "you have hit your usage limit",
      "reached your usage limit"
    ],
    usageProbe: { kind: "codex-session-files" },
    compactionProbe: { kind: "codex-session-files" },
    install: "Install Codex CLI, then run `codex login`.",
    auth: "Run `codex login` or configure your OpenAI API key.",
    updateCommands: [
      {
        label: "Update Codex",
        command: "codex",
        args: ["update"]
      }
    ],
    homepage: "https://developers.openai.com/codex/",
    summary: "OpenAI coding agent CLI with interactive and non-interactive modes."
  },
  {
    name: "kimi",
    label: "Kimi CLI",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    command: "kimi",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    // Kimi's `-p` is one-shot (exits after a turn) and there is no positional
    // prompt, so we start the interactive TUI and paste the handoff pointer.
    // It is a full coding agent, so it can read the handoff file (DEFAULT_*).
    args: [],
    handoffArgs: [],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
    // Confirmed in MoonshotAI/kimi-code + kimi-cli source: the TS TUI wraps a 429
    // as "Error: [provider.rate_limit] …"; the Python CLI prints a 402 banner and
    // the raw OpenAI error body (type tags below). "reached your usage limit for
    // this billing cycle" is the managed-OAuth 403 quota (apostrophe-free anchor).
    limitPatterns: [
      "[provider.rate_limit]",
      "membership expired, please renew your plan",
      "rate_limit_reached_error",
      "exceeded_current_quota_error",
      "engine_overloaded_error",
      "request reached organization",
      "is suspended due to insufficient balance",
      "reached your usage limit for this billing cycle"
    ],
    install: "Install with `curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash` (Windows: `irm https://code.kimi.com/kimi-code/install.ps1 | iex`), Homebrew `brew install kimi-code`, or `npm i -g @moonshot-ai/kimi-code`.",
    auth: "Run `kimi` then `/login` (browser or API key), use `kimi login` (device code), or set `KIMI_API_KEY`.",
    updateCommands: [
      {
        label: "Upgrade Kimi CLI",
        command: "kimi",
        args: ["upgrade"]
      }
    ],
    homepage: "https://www.kimi.com/code/",
    summary: "Moonshot AI's terminal coding agent (Kimi Code CLI) with an interactive TUI.",
    limitation:
      "keepitmovin starts the interactive `kimi` TUI and pastes the handoff as the first message (its `-p` mode exits after one turn). Limit banners are curated from the open-source MoonshotAI/kimi-code + kimi-cli clients, with generic detection as backstop."
  },
  {
    name: "antigravity",
    label: "Google Antigravity",
    group: "harness",
    integrationType: "pty",
    command: "agy",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    args: ["--prompt-interactive", "{{sessionPrompt}}"],
    handoffArgs: ["--prompt-interactive", "{{handoffPrompt}}"],
    // The agy binary is closed-source, so these banners come from corroborated
    // user reports (antigravity-cli issues #56/#163/#234/#457 quote the quota
    // banner verbatim; #544 and #264 the overload ones) — not confirmed in
    // source. "Individual quota reached" also covers the RESOURCE_EXHAUSTED
    // (code 429) log form, which embeds the same sentence.
    limitPatterns: [
      "individual quota reached",
      "the model api is currently overloaded",
      "our servers are experiencing high traffic right now"
    ],
    install: "Install with `curl -fsSL https://antigravity.google/cli/install.sh | bash` (Windows: `irm https://antigravity.google/cli/install.ps1 | iex`), then verify with `agy --version`.",
    auth: "Sign in by running `agy`, or set GEMINI_API_KEY / ANTIGRAVITY_API_KEY for headless use.",
    homepage: "https://antigravity.google/",
    summary: "Google's agent-first coding platform; its CLI ships as the `agy` command.",
    limitation: "keepitmovin drives Antigravity through `agy --prompt-interactive` inside a PTY. Its limit banners (\"Individual quota reached…\") are curated from corroborated user reports — the CLI is closed-source, so they cannot be confirmed in source. Generic detection remains as backstop."
  },
  {
    name: "opencode",
    label: "opencode",
    group: "harness",
    integrationType: "pty",
    command: "opencode",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    args: ["{{cwd}}", "--prompt", "{{sessionPrompt}}"],
    handoffArgs: ["{{cwd}}", "--prompt", "{{handoffPrompt}}"],
    // opencode normalizes retryable provider errors to a small set of banners it
    // renders on a red status line (packages/opencode/src/session/retry.ts on the
    // anomalyco/opencode dev branch — confirmed in source). These head their line
    // so the strict banner guard trusts them; the generic "overloaded"/"rate
    // limit" families would miss them because opencode's line leads with the
    // message, not a status word. IMPORTANT: opencode auto-retries limits forever
    // and does not exit, so the on-screen banner — not a process exit — is the
    // handoff signal. The provider-prefixed passthrough text is unbounded; these
    // are only the opencode-owned normalized strings.
    limitPatterns: [
      "provider is overloaded",
      "free usage exceeded, subscribe to go",
      "usage limit reached",
      "subscription quota exceeded",
      "gemini is way too hot right now"
    ],
    install: "Install with `npm i -g opencode-ai@latest` or Homebrew.",
    auth: "Run `opencode auth login` to configure model providers and credentials.",
    updateCommands: [
      {
        label: "Upgrade opencode",
        command: "opencode",
        args: ["upgrade"]
      }
    ],
    homepage: "https://github.com/anomalyco/opencode",
    summary: "Open-source terminal TUI/headless coding agent with provider management.",
    limitation: "opencode auto-retries rate limits indefinitely rather than exiting, so keepitmovin hands off when it sees one of opencode's normalized retry banners (\"Provider is overloaded\", \"Free usage exceeded, subscribe to Go\", …). Banner text for other providers is passed through raw and caught by generic detection. opencode also needs the prompt via `--prompt`, so it is briefly visible to local `ps` while it runs."
  }
];

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  ...SUPPORTED_CORE_CATALOG,
  ...SUPPORTED_MORE_CATALOG
];
