import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_HANDOFF_ARGS,
  DEFAULT_HANDOFF_BOOTSTRAP,
  DEFAULT_SESSION_ARGS,
  INLINE_HANDOFF_BOOTSTRAP,
  INLINE_SESSION_BOOTSTRAP,
  type ProviderCatalogEntry
} from "./catalog-types.js";

export {
  DEFAULT_HANDOFF_ARGS,
  type ProviderCatalogEntry,
  type ProviderCatalogGroup,
  type ProviderCommandSpec
} from "./catalog-types.js";

/**
 * Every tool keepitmovin knows about, in one list. This is pure data, so it is
 * exempt from the repo's 250-LOC file cap: splitting it only hid the fact that
 * *order here is behavior* — it drives the default fallback chain
 * (claude → codex → kimi → antigravity → opencode → grok → cursor → copilot →
 * ollama). Ollama stays last as the local, always-available final fallback.
 */
export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
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
  },

  {
    name: "grok",
    label: "Grok Build",
    group: "harness",
    integrationType: "pty",
    command: "grok",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    // Official CLI: `grok [OPTIONS] [PROMPT]` — positional PROMPT is the initial
    // interactive-session prompt (not headless `-p`/`--single`). Verified via
    // `grok --help` on Grok Build 0.2.x.
    args: DEFAULT_SESSION_ARGS,
    handoffArgs: DEFAULT_HANDOFF_ARGS,
    // Confirmed in xai-org/grok-build source (open source, Rust). The TUI renders
    // limit lines as "Retry failed: <message>" (see the "retry failed" indicator
    // in failure-detection.ts). Generic families catch the "rate limit"/"at
    // capacity"/"too many requests" wording; these curated strings add the
    // Grok-specific limit/credit banners generic detection would miss. All
    // apostrophe-free substrings — the tool's real banners use Unicode U+2019.
    limitPatterns: [
      "hit the rate limit for your plan",
      "reached your free grok build usage limit",
      "free-usage-exhausted",
      "you hit your free usage limit",
      "you hit your weekly limit",
      "usage balance exhausted",
      "out of credits",
      "spending cap"
    ],
    updateCommands: [
      {
        label: "Update Grok Build",
        command: "grok",
        args: ["update"]
      }
    ],
    install:
      "Install official xAI Grok Build with `curl -fsSL https://x.ai/cli/install.sh | bash` (Windows: `irm https://x.ai/cli/install.ps1 | iex`), then verify with `grok --version` (expect a Grok Build version line).",
    auth: "Run `grok login` (browser OAuth), or set `XAI_API_KEY` for headless/API-key auth.",
    homepage: "https://x.ai/cli",
    summary: "xAI coding agent CLI (Grok Build) with interactive TUI, plan mode, and subagents.",
    limitation:
      "keepitmovin drives official xAI Grok Build with a positional interactive prompt (`grok \"…\"` per `grok --help`; do not use headless `-p` here). Limit banners are curated from the open-source xai-org/grok-build client, with generic detection as backstop. The prompt is briefly visible to local `ps` while Grok runs. A third-party CLI may also install as `grok` — use the xAI installer and confirm `grok --version` reports Grok Build."
  },
  {
    name: "cursor",
    label: "Cursor Agent",
    group: "harness",
    integrationType: "pty",
    // Official binary is `agent` (installs to ~/.local/bin). Config name stays
    // `cursor` so it is not confused with other tools that also ship an `agent`.
    command: "agent",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    // Docs: `agent "refactor…"` starts an interactive session with an initial
    // prompt. Headless print mode is `agent -p "…"` — not used here.
    args: DEFAULT_SESSION_ARGS,
    handoffArgs: DEFAULT_HANDOFF_ARGS,
    // First two: direct CLI provenance (forum.cursor.com/t/128577 pasted the
    // CLI's plan-limit output verbatim). Last two: verbatim server strings the
    // CLI relays via the same chatMessage channel, confirmed only in the IDE so
    // far. Deliberately NOT matching "resource_exhausted" — Cursor staff report
    // it fires on transient stream hiccups that retries recover from.
    limitPatterns: [
      "you've hit your usage limit",
      "your usage limits will reset when your monthly cycle ends",
      "you've hit your free requests limit",
      "we're experiencing high demand"
    ],
    updateCommands: [
      {
        label: "Update Cursor Agent",
        command: "agent",
        args: ["update"]
      }
    ],
    install:
      "Install with `curl https://cursor.com/install -fsS | bash` (Windows: `irm 'https://cursor.com/install?win32=true' | iex`), ensure `~/.local/bin` is on PATH, then verify with `agent --version`.",
    auth: "Run `agent login` (browser OAuth), or set `CURSOR_API_KEY` for headless/API-key auth.",
    homepage: "https://cursor.com/cli",
    summary: "Cursor's terminal coding agent CLI with interactive sessions and headless print mode.",
    limitation:
      "keepitmovin drives Cursor Agent with a positional interactive prompt (`agent \"…\"` per Cursor docs; do not use headless `-p` here). The on-PATH binary is named `agent`, which can collide with other tools — confirm `agent --version` is Cursor Agent and that `~/.local/bin` precedes other installs. Limit banners are curated from CLI output pasted in Cursor forum reports plus server strings the CLI relays; generic detection remains as backstop. The prompt is briefly visible to local `ps` while the agent runs."
  },
  {
    name: "copilot",
    label: "GitHub Copilot CLI",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    command: "copilot",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    // Interactive: bare `copilot`. Programmatic one-shot is `copilot -p` / `--prompt`.
    // A newer `-i PROMPT` / `--interactive=PROMPT` flag starts interactive with an
    // auto-run prompt; kept on bootstrap paste until that flag is verified live.
    args: [],
    handoffArgs: [],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
    // Confirmed from user-pasted terminal output in github/copilot-cli issues
    // (#2696 rate limit, #2828 weekly, #730/#3431 402 quota_exceeded, #793 token
    // usage). Apostrophe-free anchors so smart-quote variants still match. The
    // CLI also shows a usage percentage and injects "AI credits are low" chatter —
    // isUsageWarning drops the percentage notices before these run.
    limitPatterns: [
      "hit a rate limit that restricts the number of copilot model requests",
      "reached your weekly rate limit",
      "exceeded your copilot token usage",
      "you have no quota",
      "quota_exceeded"
    ],
    updateCommands: [
      {
        label: "Update GitHub Copilot CLI",
        command: "npm",
        args: ["install", "-g", "@github/copilot@latest"]
      }
    ],
    install:
      "Install with `npm install -g @github/copilot` (Node 22+), or `brew install --cask copilot-cli`, or `curl -fsSL https://gh.io/copilot-install | bash`.",
    auth: "On first launch run `/login`, or set `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` (fine-grained PAT with Copilot Requests).",
    homepage: "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli",
    summary: "GitHub's terminal coding agent CLI (interactive TUI + programmatic `-p` mode).",
    limitation:
      "Requires an active GitHub Copilot subscription. keepitmovin starts interactive `copilot` and pastes the handoff as the first message (do not use `copilot -p`, which exits after one turn). Limit banners are curated from GitHub issue reports; generic detection remains as backstop."
  },
  {
    name: "ollama",
    label: "Ollama",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    command: "ollama",
    versionArgs: ["--version"],
    // Default-on as the local last resort: when every cloud tool is blocked,
    // Ollama runs offline. It is skipped automatically if not installed.
    defaultEnabled: true,
    controllable: true,
    args: ["run", "llama3.2"],
    handoffArgs: ["run", "llama3.2"],
    // Ollama is a plain chat REPL with no file access — paste the task/handoff
    // text inline rather than a pointer to the handoff file it cannot read.
    bootstrapInput: INLINE_SESSION_BOOTSTRAP,
    handoffBootstrapInput: INLINE_HANDOFF_BOOTSTRAP,
    install: "Install from https://ollama.com/download, then pull a model with `ollama pull llama3.2`.",
    auth: "No login required — Ollama runs models entirely on your machine.",
    homepage: "https://ollama.com/",
    summary: "Local last resort: when every cloud tool is blocked, Ollama keeps a chat going offline (advice and planning, not file edits).",
    limitation: "Ollama is a local chat model, not an autonomous coding agent — it answers and plans but won't edit files on its own, so keepitmovin keeps it last as an always-available fallback. Change the model name in `args`/`handoffArgs` (default: llama3.2) to a model you've pulled. A failed launch usually means the Ollama app isn't running (connection refused), not a rate limit."
  }
];
