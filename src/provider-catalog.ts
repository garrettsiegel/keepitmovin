import type {
  InteractiveProviderConfig,
  ProviderIntegrationType
} from "./types.js";

export type ProviderCatalogGroup = "harness" | "guided";

export interface ProviderCommandSpec {
  label: string;
  command: string;
  args: string[];
}

export interface ProviderCatalogEntry {
  name: string;
  label: string;
  group: ProviderCatalogGroup;
  integrationType: ProviderIntegrationType;
  command?: string;
  versionArgs?: string[];
  defaultEnabled: boolean;
  controllable: boolean;
  args?: string[];
  handoffArgs?: string[];
  bootstrapInput?: string;
  handoffBootstrapInput?: string;
  taskArgs?: string[];
  // Exact rate/usage-limit banners this tool prints when it blocks. Kept specific
  // enough that they cannot appear in an agent's ordinary prose — see T3 notes in
  // src/TASK.md and harness.ts:detectLiveFailure.
  limitPatterns?: string[];
  installCommands?: ProviderCommandSpec[];
  updateCommands?: ProviderCommandSpec[];
  install: string;
  auth: string;
  homepage: string;
  summary: string;
  limitation?: string;
  deprecated?: boolean;
  replacement?: string;
}

const DEFAULT_SESSION_ARGS = ["{{sessionPrompt}}"];
const DEFAULT_HANDOFF_ARGS = ["{{handoffPrompt}}"];
const DEFAULT_BOOTSTRAP = "{{sessionPrompt}}\n";
const DEFAULT_HANDOFF_BOOTSTRAP = "{{handoffPrompt}}\n";

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    name: "claude",
    label: "Claude Code",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    command: "claude",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    args: [],
    handoffArgs: [],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
    taskArgs: ["-p", "--permission-mode", "acceptEdits", "{{prompt}}"],
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
    integrationType: "pty_with_bootstrap_input",
    command: "codex",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    args: [],
    handoffArgs: [],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
    taskArgs: [
      "exec",
      "--sandbox",
      "workspace-write",
      "--ask-for-approval",
      "never",
      "--color",
      "never",
      "{{prompt}}"
    ],
    limitPatterns: [
      "you've hit your usage limit",
      "you have hit your usage limit",
      "reached your usage limit"
    ],
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
    args: DEFAULT_SESSION_ARGS,
    handoffArgs: DEFAULT_HANDOFF_ARGS,
    taskArgs: ["--json", "--yolo", "--cwd", "{{cwd}}", "{{prompt}}"],
    install: "Install with `npm install -g cline`.",
    auth: "Configure Cline providers/models, including OpenRouter, before enabling it.",
    homepage: "https://cline.bot/",
    summary: "Model-flexible coding agent available as CLI, IDE extension, and SDK.",
    limitation: "Disabled by default. Verify the installed `cline` CLI's run/prompt flags and configure an OpenRouter model before enabling it as a harness provider."
  },
  {
    name: "antigravity",
    label: "Google Antigravity",
    group: "harness",
    integrationType: "pty_with_bootstrap_input",
    command: "agy",
    versionArgs: ["--version"],
    defaultEnabled: true,
    controllable: true,
    args: [],
    handoffArgs: [],
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
    install: "Install with `curl -fsSL https://antigravity.google/cli/install.sh | bash` (Windows: `irm https://antigravity.google/cli/install.ps1 | iex`), then verify with `agy --version`.",
    auth: "Sign in by running `agy`, or set GEMINI_API_KEY / ANTIGRAVITY_API_KEY for headless use.",
    homepage: "https://antigravity.google/",
    summary: "Google's agent-first coding platform; its CLI ships as the `agy` command.",
    limitation: "CodePass drives Antigravity through the interactive `agy` TUI inside a PTY and types the prompt after launch. No verified rate-limit banner yet, so it relies on CodePass's generic limit detection (add exact strings to `limitPatterns` once confirmed)."
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
    taskArgs: ["run", "{{prompt}}"],
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
    limitation: "opencode routes to whichever model provider you configure, so its limit banner varies by provider — CodePass uses generic limit detection here rather than a fixed `limitPatterns` list."
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
    bootstrapInput: DEFAULT_BOOTSTRAP,
    handoffBootstrapInput: DEFAULT_HANDOFF_BOOTSTRAP,
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

const HARNESS_TYPES = new Set<ProviderIntegrationType>([
  "pty",
  "pty_with_bootstrap_input",
  "custom_command"
]);

export const getProviderCatalog = (): ProviderCatalogEntry[] => PROVIDER_CATALOG;

export const getCatalogEntry = (name: string): ProviderCatalogEntry | undefined =>
  PROVIDER_CATALOG.find((entry) => entry.name === name);

export const isCatalogHarnessProvider = (entry: ProviderCatalogEntry): boolean =>
  entry.group === "harness" && entry.controllable && HARNESS_TYPES.has(entry.integrationType);

export const isHarnessControllable = (provider: Pick<InteractiveProviderConfig, "controllable" | "integrationType">): boolean =>
  (provider.controllable ?? true) && HARNESS_TYPES.has(provider.integrationType);

export const catalogEntryToInteractiveProvider = (
  entry: ProviderCatalogEntry
): InteractiveProviderConfig => {
  if (!entry.command) {
    throw new Error(`Catalog entry is not launchable: ${entry.name}`);
  }

  return {
    name: entry.name,
    label: entry.label,
    enabled: entry.defaultEnabled,
    command: entry.command,
    args: entry.args ?? [],
    handoffArgs: entry.handoffArgs ?? DEFAULT_HANDOFF_ARGS,
    integrationType: entry.integrationType,
    bootstrapInput: entry.bootstrapInput,
    handoffBootstrapInput: entry.handoffBootstrapInput,
    controllable: entry.controllable,
    limitPatterns: entry.limitPatterns
  };
};

export const getDefaultInteractiveProviders = (): InteractiveProviderConfig[] =>
  PROVIDER_CATALOG
    .filter(isCatalogHarnessProvider)
    .map(catalogEntryToInteractiveProvider);

export const getDefaultProviderOrder = (): string[] =>
  getDefaultInteractiveProviders()
    .filter((provider) => provider.enabled)
    .map((provider) => provider.name);

export const mergeCatalogInteractiveProviders = (
  providers: InteractiveProviderConfig[]
): InteractiveProviderConfig[] => {
  const migratedProviders = providers.map((provider) => {
    const catalogEntry = getCatalogEntry(provider.name);

    if (!catalogEntry) {
      return provider;
    }

    if (!catalogEntry.deprecated && isCatalogHarnessProvider(catalogEntry)) {
      const catalogProvider = catalogEntryToInteractiveProvider(catalogEntry);

      return {
        ...provider,
        label: catalogProvider.label,
        command: catalogProvider.command,
        args: catalogProvider.args,
        handoffArgs: catalogProvider.handoffArgs,
        integrationType: catalogProvider.integrationType,
        bootstrapInput: catalogProvider.bootstrapInput,
        handoffBootstrapInput: catalogProvider.handoffBootstrapInput,
        controllable: catalogProvider.controllable,
        limitPatterns: catalogProvider.limitPatterns
      };
    }

    if (!catalogEntry.deprecated) {
      return provider;
    }

    return {
      ...provider,
      label: catalogEntry.label,
      enabled: false,
      integrationType: catalogEntry.integrationType,
      controllable: false
    };
  });
  const configuredNames = new Set(migratedProviders.map((provider) => provider.name));
  const catalogDefaults = getDefaultInteractiveProviders()
    .filter((provider) => !configuredNames.has(provider.name));

  return [...migratedProviders, ...catalogDefaults];
};
