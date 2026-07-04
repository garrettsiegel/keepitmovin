import type {
  InteractiveProviderConfig,
  ProviderConfig,
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
    limitation: "CodePass drives Antigravity through the interactive `agy` TUI inside a PTY and types the prompt after launch. Its non-interactive `-p`/`--print` mode currently drops stdout on non-TTY pipes, so CodePass does not use it for task mode."
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
    summary: "Open-source terminal TUI/headless coding agent with provider management."
  },
  {
    name: "gemini",
    label: "Gemini CLI",
    group: "guided",
    integrationType: "external_app",
    command: "gemini",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: false,
    install: "Gemini CLI is legacy for CodePass. Use Google Antigravity for new Google-agent setups.",
    auth: "Migrate Google-agent workflows to Antigravity.",
    homepage: "https://github.com/google-gemini/gemini-cli",
    summary: "Deprecated Google terminal agent path kept for migration guidance.",
    limitation: "Google is transitioning Gemini CLI users to Antigravity, so CodePass no longer includes Gemini CLI in the auto-switch chain by default.",
    deprecated: true,
    replacement: "antigravity"
  },
  {
    name: "github-copilot",
    label: "GitHub Copilot / Agent HQ",
    group: "guided",
    integrationType: "cloud_link",
    command: "gh",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: false,
    install: "Install GitHub CLI and enable Copilot/Agent HQ in GitHub or VS Code.",
    auth: "Run `gh auth login`; Copilot agent access depends on your GitHub plan.",
    homepage: "https://github.com/features/copilot",
    summary: "Popular IDE/GitHub coding agent workflow.",
    limitation: "CodePass can guide setup, but cannot live-switch into private GitHub cloud sessions."
  },
  {
    name: "cursor",
    label: "Cursor",
    group: "guided",
    integrationType: "external_app",
    command: "cursor",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: false,
    install: "Install Cursor from cursor.com.",
    auth: "Sign in inside Cursor and configure your model plan.",
    homepage: "https://cursor.com/",
    summary: "Popular AI editor with codebase-aware agents.",
    limitation: "CodePass can detect/link Cursor, but cannot control Cursor's private editor session."
  },
  {
    name: "devin",
    label: "Devin",
    group: "guided",
    integrationType: "cloud_link",
    defaultEnabled: false,
    controllable: false,
    install: "Create or sign in to a Devin account.",
    auth: "Authenticate in Devin's web app.",
    homepage: "https://devin.ai/",
    summary: "Cloud software-engineering agent.",
    limitation: "CodePass cannot launch or observe Devin without a supported local/API bridge."
  },
  {
    name: "openhands",
    label: "OpenHands Agent Canvas",
    group: "guided",
    integrationType: "server",
    command: "agent-canvas",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: false,
    install: "Install with `npm install -g @openhands/agent-canvas`.",
    auth: "Configure agent backends in OpenHands Agent Canvas.",
    homepage: "https://github.com/OpenHands/OpenHands",
    summary: "Self-hosted agent control center that can run multiple backends.",
    limitation: "CodePass should integrate through server/API work later, not pretend it is a PTY tool."
  },
  {
    name: "continue",
    label: "Continue",
    group: "guided",
    integrationType: "external_app",
    command: "continue",
    versionArgs: ["--version"],
    defaultEnabled: false,
    controllable: false,
    install: "Use the final Continue CLI/extension release if needed.",
    auth: "Configure local/provider credentials in Continue.",
    homepage: "https://github.com/continuedev/continue",
    summary: "Open-source coding agent CLI/IDE project.",
    limitation: "Repository is read-only/final release, so CodePass treats it as legacy guided setup."
  },
  {
    name: "roo-code",
    label: "Roo Code",
    group: "guided",
    integrationType: "external_app",
    defaultEnabled: false,
    controllable: false,
    install: "Roo Code is archived; use Cline or a maintained fork for new setups.",
    auth: "Configure inside the IDE extension if you already use it.",
    homepage: "https://github.com/RooCodeInc/Roo-Code",
    summary: "Former VS Code agent extension.",
    limitation: "Archived on May 15, 2026, so CodePass treats it as legacy guided setup."
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
    controllable: entry.controllable
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

export const getDefaultTaskProviders = (timeoutMs: number): ProviderConfig[] =>
  PROVIDER_CATALOG
    .filter((entry) => entry.group === "harness" && Boolean(entry.command) && Boolean(entry.taskArgs))
    .map((entry) => ({
      name: entry.name,
      enabled: entry.defaultEnabled,
      command: entry.command ?? entry.name,
      args: entry.taskArgs ?? [],
      timeoutMs
    }));

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
        controllable: catalogProvider.controllable
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
