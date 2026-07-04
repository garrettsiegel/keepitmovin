import type { InteractiveProviderConfig, CodePassConfig } from "./types.js";
import { isHarnessControllable } from "./provider-catalog.js";

export interface RenderLaunchOptions {
  cwd: string;
  handoffPrompt?: string;
  handoffPath?: string;
  sessionPrompt?: string;
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

  return {
    command: provider.command,
    args: argsTemplate.map((arg) => renderTemplate(arg, options)),
    ...(bootstrapInput ? { bootstrapInput } : {})
  };
};

export const getInteractiveProviderMap = (
  config: CodePassConfig
): Map<string, InteractiveProviderConfig> =>
  new Map(config.harness.providers.map((provider) => [provider.name, provider]));

export const getEnabledInteractiveProviders = (
  config: CodePassConfig
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
