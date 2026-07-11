import process from "node:process";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import type { AgentErrorType, InteractiveProviderConfig, ProviderIntegrationType } from "./types.js";
import { describeProviderChain } from "./interactive-provider.js";

export interface ToolStatusView {
  name: string;
  label: string;
  command: string;
  available: boolean;
  detail: string;
  guidance: string;
  group?: "harness" | "guided";
  integrationType?: ProviderIntegrationType;
  controllable?: boolean;
  summary?: string;
  limitation?: string;
}

const visibleLength = (value: string): number => stripAnsi(value).length;

const clampWidth = (): number => {
  const terminalWidth = process.stdout.columns || 80;
  return Math.max(56, Math.min(terminalWidth - 4, 82));
};

const padVisible = (value: string, width: number): string => {
  const padding = Math.max(0, width - visibleLength(value));
  return `${value}${" ".repeat(padding)}`;
};

const centerVisible = (value: string, width: number): string => {
  const padding = Math.max(0, width - visibleLength(value));
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return `${" ".repeat(left)}${value}${" ".repeat(right)}`;
};

const box = (title: string, lines: string[]): string => {
  const width = clampWidth();
  const top = chalk.cyan(`╭${"─".repeat(width + 2)}╮`);
  const titleLine = `${chalk.cyan("│")} ${centerVisible(chalk.bold(title), width)} ${chalk.cyan("│")}`;
  const divider = chalk.cyan(`├${"─".repeat(width + 2)}┤`);
  const body = lines.map((line) => `${chalk.cyan("│")} ${padVisible(line, width)} ${chalk.cyan("│")}`);
  const bottom = chalk.cyan(`╰${"─".repeat(width + 2)}╯`);

  return [top, titleLine, divider, ...body, bottom].join("\n");
};

const bullet = (label: string, text: string): string =>
  `${chalk.cyan("•")} ${chalk.bold(label)} ${chalk.gray(text)}`;

const statusPill = (status: ToolStatusView): string => {
  if (status.group === "guided" || status.controllable === false) {
    if (status.integrationType === "cloud_link") {
      return chalk.bgMagenta.black(" CLOUD ");
    }

    if (status.integrationType === "server") {
      return chalk.bgCyan.black(" SERVER ");
    }

    return chalk.bgBlue.black(" GUIDED ");
  }

  if (status.available) {
    return chalk.bgGreen.black(" READY ");
  }

  return chalk.bgBlue.black(" ADD LATER ");
};

const statusSymbol = (status: ToolStatusView): string => {
  if (status.group === "guided" || status.controllable === false) {
    return chalk.blue("○");
  }

  if (status.available) {
    return chalk.green("✓");
  }

  return chalk.blue("+");
};

const friendlyDetail = (status: ToolStatusView): string => {
  if (status.group === "guided" || status.controllable === false) {
    return status.summary ?? status.limitation ?? "guided setup only";
  }

  if (status.available) {
    return status.detail;
  }

  return status.summary ?? "install when you want to add it";
};

const sectionRows = (
  title: string,
  statuses: ToolStatusView[],
  nameWidth: number,
  commandWidth: number
): string[] => {
  if (statuses.length === 0) {
    return [chalk.bold(title), chalk.gray("  Nothing in this group yet.")];
  }

  return [
    chalk.bold(title),
    ...statuses.flatMap((status) => {
      const command = status.command || "setup guide";

      return [
        [
          statusSymbol(status),
          padVisible(status.label, nameWidth),
          statusPill(status),
          chalk.gray(padVisible(command, commandWidth)),
          chalk.gray(friendlyDetail(status))
        ].join("  "),
        `   ${chalk.gray(status.guidance)}`
      ];
    })
  ];
};

export const renderSetupIntro = (): string => [
  "",
  box("CodePass", [
    "One terminal for Claude, Codex, Antigravity, opencode, Grok, Cursor, and your fallback stack.",
    "CodePass starts the first tool, keeps a live handoff file,",
    "and helps you switch when limits or login issues interrupt work."
  ]),
  "",
  chalk.bold("How this session works"),
  bullet("1.", "Pick the tools CodePass should use."),
  bullet("2.", "CodePass starts the first available tool for you."),
  bullet("3.", "If a limit hits, CodePass switches tools with the handoff file."),
  "",
  chalk.gray("CodePass cannot copy private chat state between tools; the handoff file is the shared continuity layer.")
].join("\n");

export const renderToolCheck = (statuses: ToolStatusView[]): string => {
  const nameWidth = Math.max(...statuses.map((status) => visibleLength(status.label)), 10);
  const commandWidth = Math.max(...statuses.map((status) => visibleLength(status.command || "setup guide")), 10);
  const readyNow = statuses.filter((status) =>
    status.group !== "guided" && status.controllable !== false && status.available
  );
  const installToUse = statuses.filter((status) =>
    status.group !== "guided" && status.controllable !== false && !status.available
  );
  const guided = statuses.filter((status) =>
    status.group === "guided" || status.controllable === false
  );

  return [
    "",
    chalk.bold("Tool check"),
    ...sectionRows("Ready now", readyNow, nameWidth, commandWidth),
    "",
    ...sectionRows("Install to use", installToUse, nameWidth, commandWidth),
    "",
    ...sectionRows("Popular IDE/cloud tools", guided, nameWidth, commandWidth),
    ""
  ].join("\n");
};

export const formatToolChoiceLabel = (
  provider: InteractiveProviderConfig,
  status: ToolStatusView | undefined
): string => {
  if (status?.available) {
    return `${provider.label} ${chalk.gray("ready")}`;
  }

  return `${provider.label} ${chalk.gray("add later")}`;
};

export const renderProviderOrderSummary = (
  providers: InteractiveProviderConfig[],
  providerOrder: string[]
): string => {
  const providerMap = new Map(providers.map((provider) => [provider.name, provider.label]));
  const labels = providerOrder.map((name) => providerMap.get(name) ?? name);
  return `${chalk.bold("Selected chain")} ${chalk.green(labels.join(" → "))}`;
};

export const renderSetupSaved = (configPath: string, chain: string): string => [
  "",
  chalk.green("CodePass setup saved."),
  `${chalk.bold("Config")} ${chalk.gray(configPath)}`,
  chain,
  ""
].join("\n");

// Short, varied copy for the switch interstitial, keyed by the failure reason
// that triggered it. Falls back to a generic message for reasons without a
// specific line (nonzero_exit, unknown, command_not_found).
const COMMERCIAL_BREAK_COPY: Partial<Record<AgentErrorType, string>> = {
  rate_limit: "hit its usage limit",
  quota_exceeded: "ran out of quota",
  auth_error: "needs you to sign in again",
  timeout: "went quiet for too long",
  manual_switch: "was switched out by you"
};

export const renderCommercialBreak = (
  fromLabel: string,
  toLabel: string,
  reason: AgentErrorType
): string => {
  const situation = COMMERCIAL_BREAK_COPY[reason] ?? "hit a snag";

  return [
    "",
    box("☕ Commercial break", [
      `${fromLabel} ${situation}. Moving to ${toLabel}...`,
      "Handoff ready — pick up right where you left off."
    ]),
    ""
  ].join("\n");
};

export const renderHarnessStart = (providers: InteractiveProviderConfig[]): string => [
  "",
  box("CodePass Harness", [
    `Starting chain: ${describeProviderChain(providers)}`,
    "Press Ctrl+] if you want to switch tools manually.",
    "CodePass will keep the handoff file ready in the background."
  ]),
  ""
].join("\n");
