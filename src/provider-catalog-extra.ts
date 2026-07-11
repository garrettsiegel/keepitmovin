import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_HANDOFF_ARGS,
  DEFAULT_HANDOFF_BOOTSTRAP,
  DEFAULT_SESSION_ARGS,
  type ProviderCatalogEntry
} from "./provider-catalog-types.js";

/**
 * Optional / opt-in harness tools. Kept separate so provider-catalog-data.ts
 * stays under the 250 LOC limit. All defaultEnabled: false — enable after
 * install + auth (like Cline / Ollama).
 */
export const EXTRA_PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    name: "aider",
    label: "Aider",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
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
      "Disabled by default. CodePass starts the interactive Aider REPL and pastes the handoff as the first message (do not use `aider --message`, which exits after one turn). Configure a model before enabling. Aider may auto-commit changes — review git history after handoffs."
  },
  {
    name: "goose",
    label: "Goose",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
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
      "Disabled by default. CodePass runs `goose session` and pastes the handoff as the first message. Configure a provider with `goose configure` before enabling. Limit banners depend on the backend model — generic detection only."
  },
  {
    name: "amp",
    label: "Amp",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
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
      "Disabled by default. CodePass starts interactive `amp` and pastes the handoff as the first message (do not use `amp -x`, which exits after one turn). No curated rate-limit banners yet — generic detection only."
  },
  {
    name: "droid",
    label: "Factory Droid",
    group: "harness",
    integrationType: "pty",
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
      "Disabled by default. CodePass uses positional interactive prompts (`droid \"…\"`); do not use `droid exec` for harness sessions. No curated rate-limit banners yet — generic detection only. The prompt is briefly visible to local `ps`."
  },
  {
    name: "copilot",
    label: "GitHub Copilot CLI",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    command: "copilot",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: true,
    // Interactive: bare `copilot`. Programmatic one-shot is `copilot -p` / `--prompt`.
    args: [],
    handoffArgs: [],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
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
      "Disabled by default. Requires an active GitHub Copilot subscription. CodePass starts interactive `copilot` and pastes the handoff as the first message (do not use `copilot -p`, which exits after one turn). No curated rate-limit banners yet — generic detection only."
  }
];
