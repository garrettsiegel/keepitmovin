import { EXTRA_PROVIDER_CATALOG } from "./provider-catalog-extra.js";
import {
  DEFAULT_HANDOFF_ARGS,
  DEFAULT_SESSION_ARGS,
  INLINE_HANDOFF_BOOTSTRAP,
  INLINE_SESSION_BOOTSTRAP,
  type ProviderCatalogEntry
} from "./provider-catalog-types.js";

export {
  DEFAULT_HANDOFF_ARGS,
  type ProviderCatalogEntry,
  type ProviderCatalogGroup,
  type ProviderCommandSpec
} from "./provider-catalog-types.js";

const CORE_PROVIDER_CATALOG: ProviderCatalogEntry[] = [
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
    limitPatterns: [
      "5-hour limit reached",
      "upgrade to increase your usage limit",
      "you've reached your usage limit"
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
    name: "cline",
    label: "Cline",
    group: "harness",
    integrationType: "pty",
    command: "cline",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: true,
    // Official CLI: `-i`/`--tui` opens the interactive TUI with an optional prompt.
    // A bare positional prompt without `-i` is not the durable multi-turn TUI path.
    args: ["-i", "{{sessionPrompt}}"],
    handoffArgs: ["-i", "{{handoffPrompt}}"],
    updateCommands: [
      {
        label: "Update Cline",
        command: "cline",
        args: ["update"]
      }
    ],
    install: "Install with `npm install -g cline`.",
    auth: "Run `cline auth` and configure providers/models (including OpenRouter) before enabling it.",
    homepage: "https://cline.bot/",
    summary: "Model-flexible coding agent available as CLI, IDE extension, and SDK.",
    limitation:
      "Disabled by default. CodePass launches interactive TUI mode (`cline -i \"…\"`); confirm your installed `cline` supports the `-i`/`--tui` flag (older builds may not). Configure a model with `cline auth` before enabling. The prompt is briefly visible to local `ps` while Cline runs."
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
    install: "Install with `curl -fsSL https://antigravity.google/cli/install.sh | bash` (Windows: `irm https://antigravity.google/cli/install.ps1 | iex`), then verify with `agy --version`.",
    auth: "Sign in by running `agy`, or set GEMINI_API_KEY / ANTIGRAVITY_API_KEY for headless use.",
    homepage: "https://antigravity.google/",
    summary: "Google's agent-first coding platform; its CLI ships as the `agy` command.",
    limitation: "CodePass drives Antigravity through `agy --prompt-interactive` inside a PTY. No verified rate-limit banner yet, so it relies on CodePass's generic limit detection (add exact strings to `limitPatterns` once confirmed)."
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
    install: "Install with `npm i -g opencode-ai@latest` or Homebrew.",
    auth: "Run `opencode providers` to configure model providers and credentials.",
    updateCommands: [
      {
        label: "Upgrade opencode",
        command: "opencode",
        args: ["upgrade"]
      }
    ],
    homepage: "https://github.com/anomalyco/opencode",
    summary: "Open-source terminal TUI/headless coding agent with provider management.",
    limitation: "opencode routes to whichever model provider you configure, so its limit banner varies by provider — CodePass uses generic limit detection here rather than a fixed `limitPatterns` list. It also requires the prompt via `--prompt`, so the handoff prompt is briefly visible to local `ps` while opencode runs."
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
    // No curated rate-limit banners yet — rely on generic detection until exact
    // strings are confirmed from a real Grok Build limit event.
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
      "CodePass drives official xAI Grok Build with a positional interactive prompt (`grok \"…\"` per `grok --help`; do not use headless `-p` here). No curated rate-limit banners yet, so switches rely on generic limit detection until exact strings are confirmed. The prompt is briefly visible to local `ps` while Grok runs. A third-party CLI may also install as `grok` — use the xAI installer and confirm `grok --version` reports Grok Build."
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
    // No curated rate-limit banners yet — rely on generic detection until exact
    // strings are confirmed from a real Cursor Agent limit event.
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
      "CodePass drives Cursor Agent with a positional interactive prompt (`agent \"…\"` per Cursor docs; do not use headless `-p` here). The on-PATH binary is named `agent`, which can collide with other tools — confirm `agent --version` is Cursor Agent and that `~/.local/bin` precedes other installs. No curated rate-limit banners yet, so switches rely on generic limit detection until exact strings are confirmed. The prompt is briefly visible to local `ps` while the agent runs."
  },
  {
    name: "ollama",
    label: "Ollama",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    command: "ollama",
    versionArgs: ["--version"],
    defaultEnabled: false,
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
    summary: "Local model runtime; CodePass starts a chat session and pastes the handoff as the first message.",
    limitation: "Ollama is a plain chat REPL, not an autonomous coding agent — it won't edit files on its own. Change the model name in `args`/`handoffArgs` (default: llama3.2) to match a model you've pulled. A failed launch usually means the Ollama daemon isn't running (connection refused), not a rate limit."
  },
  {
    name: "openrouter",
    label: "OpenRouter",
    group: "guided",
    integrationType: "external_app",
    defaultEnabled: false,
    controllable: false,
    install: "Create an OpenRouter account and generate an API key at https://openrouter.ai/keys.",
    auth: "Set OPENROUTER_API_KEY, then point opencode or Cline at an OpenRouter model.",
    homepage: "https://openrouter.ai/",
    summary: "Model-routing gateway reached through opencode or Cline, not a standalone CLI.",
    limitation: "CodePass does not launch OpenRouter directly — configure it as a model provider inside opencode (`opencode providers`) or Cline's model settings."
  }
];

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  ...CORE_PROVIDER_CATALOG,
  ...EXTRA_PROVIDER_CATALOG
];
