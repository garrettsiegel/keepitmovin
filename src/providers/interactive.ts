import type { InteractiveProviderConfig, KeepitmovinConfig } from "../config/types.js";
import { isHarnessControllable } from "./catalog.js";
import type { AppliedRoute } from "../config/types.js";
import { applyRouteToLaunch } from "../routing/model.js";

export interface RenderLaunchOptions {
  cwd: string;
  handoffPrompt?: string;
  handoffPath?: string;
  sessionPrompt?: string;
  route?: AppliedRoute;
}

export interface ProviderLaunch {
  command: string;
  args: string[];
  bootstrapInput?: string;
}

const renderTemplate = (
  value: string,
  options: RenderLaunchOptions
): string => value
  .replaceAll("{{cwd}}", options.cwd)
  .replaceAll("{{handoffPath}}", options.handoffPath ?? "")
  .replaceAll("{{sessionPrompt}}", options.sessionPrompt ?? "")
  .replaceAll("{{handoffPrompt}}", options.handoffPrompt ?? "");

export const renderInteractiveLaunch = (
  provider: InteractiveProviderConfig,
  options: RenderLaunchOptions
): ProviderLaunch => {
  const argsTemplate = options.handoffPrompt ? provider.handoffArgs : provider.args;
  const bootstrapTemplate = options.handoffPrompt
    ? provider.handoffBootstrapInput ?? provider.bootstrapInput
    : provider.bootstrapInput;
  const bootstrapInput = bootstrapTemplate
    ? renderTemplate(bootstrapTemplate, options)
    : undefined;

  const launch = {
    command: provider.command,
    args: argsTemplate.map((arg) => renderTemplate(arg, options)),
    ...(bootstrapInput ? { bootstrapInput } : {})
  };
  return options.route ? applyRouteToLaunch(launch, options.route) : launch;
};

// Renders the launch command for the terminal banner. Long arg lists (typically
// the injected handoff/session prompt, which names the repo path and switch
// reason) are collapsed to a `[+N args]` marker so the prompt isn't dumped into
// the user's scrollback where other local users could read it.
const COMMAND_ECHO_ARG_LIMIT = 120;

export const formatCommandEcho = (command: string, args: string[]): string => {
  const joined = args.join(" ");
  if (joined.length <= COMMAND_ECHO_ARG_LIMIT) {
    return joined.length > 0 ? `${command} ${joined}` : command;
  }

  return `${command} [+${args.length} arg${args.length === 1 ? "" : "s"}]`;
};

export const getInteractiveProviderMap = (
  config: KeepitmovinConfig
): Map<string, InteractiveProviderConfig> =>
  new Map(config.harness.providers.map((provider) => [provider.name, provider]));

export const getEnabledInteractiveProviders = (
  config: KeepitmovinConfig
): InteractiveProviderConfig[] => {
  const providerMap = getInteractiveProviderMap(config);

  return config.harness.providerOrder
    .map((name) => providerMap.get(name))
    .filter((provider): provider is InteractiveProviderConfig =>
      Boolean(provider?.enabled) && Boolean(provider && isHarnessControllable(provider))
    );
};

export const describeProviderChain = (
  providers: InteractiveProviderConfig[]
): string => providers.map((provider) => provider.label).join(" -> ");
