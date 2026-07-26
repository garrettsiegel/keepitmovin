import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_HANDOFF_ARGS,
  DEFAULT_HANDOFF_BOOTSTRAP,
  DEFAULT_SESSION_ARGS,
  type ProviderCatalogEntry
} from "./catalog-types.js";

/**
 * Hidden tools. Every entry is `supportLevel: "hidden"`: kept in the catalog so
 * existing configs that reference them keep launching, but left out of the setup
 * wizard, config defaults, and docs until they earn full support (verified limit
 * banners + transport). Bring one back by moving it into a supported catalog file
 * and dropping its `supportLevel`. Kept separate so the supported files stay
 * under the 250 LOC limit.
 */
export const EXTRA_PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    name: "cline",
    label: "Cline",
    group: "harness",
    integrationType: "pty",
    supportLevel: "hidden",
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
      "Hidden until it earns full support. keepitmovin launches interactive TUI mode (`cline -i \"…\"`); confirm your installed `cline` supports the `-i`/`--tui` flag (older builds may not). Configure a model with `cline auth` before enabling. The prompt is briefly visible to local `ps` while Cline runs."
  },
  {
    name: "openrouter",
    label: "OpenRouter",
    group: "guided",
    integrationType: "external_app",
    supportLevel: "hidden",
    defaultEnabled: false,
    controllable: false,
    install: "Create an OpenRouter account and generate an API key at https://openrouter.ai/keys.",
    auth: "Set OPENROUTER_API_KEY, then point opencode or Cline at an OpenRouter model.",
    homepage: "https://openrouter.ai/",
    summary: "Model-routing gateway reached through opencode or Cline, not a standalone CLI.",
    limitation: "keepitmovin does not launch OpenRouter directly — configure it as a model provider inside opencode (`opencode providers`) or Cline's model settings."
  },
  {
    name: "aider",
    label: "Aider",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    supportLevel: "hidden",
    command: "aider",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: true,
    // `aider --message` is single-shot and exits; keep the interactive REPL and
    // paste the session/handoff prompt after spawn (same pattern as Ollama).
    args: [],
    handoffArgs: [],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
    updateCommands: [
      {
        label: "Upgrade Aider",
        command: "aider",
        args: ["--upgrade"]
      }
    ],
    install:
      "Install with `python -m pip install aider-install && aider-install` (or the official uv one-liners at https://aider.chat/docs/install.html).",
    auth: "Configure an LLM API key (e.g. OPENAI_API_KEY, ANTHROPIC_API_KEY) or pass `--model` / `--api-key` in config args.",
    homepage: "https://aider.chat/",
    summary: "Git-native pair-programming agent; model-agnostic CLI that edits files via diffs.",
    limitation:
      "Hidden until it earns full support. keepitmovin starts the interactive Aider REPL and pastes the handoff as the first message (do not use `aider --message`, which exits after one turn). Configure a model before enabling. Aider may auto-commit changes — review git history after handoffs."
  },
  {
    name: "goose",
    label: "Goose",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    supportLevel: "hidden",
    command: "goose",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: true,
    args: ["session"],
    handoffArgs: ["session"],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
    install:
      "Install with `curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash` (or Homebrew: `brew install block-goose-cli`), then run `goose configure`.",
    auth: "Run `goose configure` and select an LLM provider (API key, OpenRouter, GitHub Copilot, etc.).",
    homepage: "https://goose-docs.ai/",
    summary: "Open-source extensible agent (Block / AAIF) with CLI sessions and MCP extensions.",
    limitation:
      "Hidden until it earns full support. keepitmovin runs `goose session` and pastes the handoff as the first message. Configure a provider with `goose configure` before enabling. Limit banners depend on the backend model — generic detection only."
  },
  {
    name: "amp",
    label: "Amp",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    supportLevel: "hidden",
    command: "amp",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: true,
    // Interactive TUI is bare `amp`. `amp -x` / `--execute` is one-shot exit mode.
    args: [],
    handoffArgs: [],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
    updateCommands: [
      {
        label: "Update Amp",
        command: "amp",
        args: ["update"]
      }
    ],
    install:
      "Install with `curl -fsSL https://ampcode.com/install.sh | bash` (Windows: `powershell -c \"irm https://ampcode.com/install.ps1 | iex\"`), or Homebrew `brew install ampcode/tap/ampcode`.",
    auth: "Sign in via the Amp CLI on first run, or set `AMP_API_KEY` for non-interactive environments.",
    homepage: "https://ampcode.com/",
    summary: "Sourcegraph Amp frontier coding agent for terminal and editor.",
    limitation:
      "Hidden until it earns full support. keepitmovin starts interactive `amp` and pastes the handoff as the first message (do not use `amp -x`, which exits after one turn). No curated rate-limit banners yet — generic detection only."
  },
  {
    name: "droid",
    label: "Factory Droid",
    group: "harness",
    integrationType: "pty",
    supportLevel: "hidden",
    command: "droid",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: true,
    // Docs: `droid "query"` starts the interactive REPL with an initial prompt.
    // Headless automation is `droid exec` — not used here.
    args: DEFAULT_SESSION_ARGS,
    handoffArgs: DEFAULT_HANDOFF_ARGS,
    updateCommands: [
      {
        label: "Update Factory Droid",
        command: "droid",
        args: ["update"]
      }
    ],
    install:
      "Install with `curl -fsSL https://app.factory.ai/cli | sh` (Windows: `irm https://app.factory.ai/cli/windows | iex`), or `brew install --cask droid`.",
    auth: "Run `droid` and use `/login`, or set `FACTORY_API_KEY` (from https://app.factory.ai/settings/api-keys).",
    homepage: "https://factory.ai/",
    summary: "Factory's terminal coding agent (Droid) with interactive TUI and `droid exec` for CI.",
    limitation:
      "Hidden until it earns full support. keepitmovin uses positional interactive prompts (`droid \"…\"`); do not use `droid exec` for harness sessions. No curated rate-limit banners yet — generic detection only. The prompt is briefly visible to local `ps`."
  }
];
