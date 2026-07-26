import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_HANDOFF_ARGS,
  DEFAULT_HANDOFF_BOOTSTRAP,
  DEFAULT_SESSION_ARGS,
  INLINE_HANDOFF_BOOTSTRAP,
  INLINE_SESSION_BOOTSTRAP,
  type ProviderCatalogEntry
} from "./catalog-types.js";

/**
 * Fully-supported tools, part 2 (see provider-catalog-data.ts for part 1 and the
 * ordering rationale). Split only to keep each catalog file under 250 LOC. Ollama
 * is intentionally last so it acts as the local, always-available final fallback.
 */
export const SUPPORTED_MORE_CATALOG: ProviderCatalogEntry[] = [
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
