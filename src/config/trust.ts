import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { confirm, isCancel } from "@clack/prompts";
import {
  catalogEntryToInteractiveProvider,
  getCatalogEntry,
  isCatalogHarnessProvider
} from "../providers/catalog.js";
import type { InteractiveProviderConfig, KeepitmovinConfig } from "./types.js";
import { ARTIFACT_FILE_MODE } from "../util/paths.js";

const TRUST_STORE_FILE = "trusted-configs.json";

/**
 * Thrown when a config defines custom provider commands that haven't been trusted.
 * Command handlers catch this, print the message, and exit non-zero.
 */
export class UntrustedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UntrustedConfigError";
  }
}

const arraysEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Returns providers whose executable command is NOT dictated by the trusted
 * built-in catalog. `mergeCatalogInteractiveProviders` forces known harness
 * providers back to catalog commands on every load, so this reduces to providers
 * with no harness-catalog entry (or one whose command/args a caller has diverged)
 * — the arbitrary-command surface a malicious repo config can introduce. All
 * providers are considered (not just enabled ones), because doctor/setup probe
 * every configured provider with `<command> --version`.
 */
export const computeCustomProviders = (
  config: KeepitmovinConfig
): InteractiveProviderConfig[] =>
  config.harness.providers.filter((provider) => {
    const entry = getCatalogEntry(provider.name);
    if (!entry || !isCatalogHarnessProvider(entry)) {
      return true;
    }

    const catalogProvider = catalogEntryToInteractiveProvider(entry);
    return (
      provider.command !== catalogProvider.command ||
      !arraysEqual(provider.args, catalogProvider.args) ||
      !arraysEqual(provider.handoffArgs, catalogProvider.handoffArgs) ||
      provider.bootstrapInput !== catalogProvider.bootstrapInput ||
      provider.handoffBootstrapInput !== catalogProvider.handoffBootstrapInput
    );
  });

export const hashConfig = (rawConfig: string): string =>
  createHash("sha256").update(rawConfig).digest("hex");

export const resolveKeepitmovinHome = (override?: string): string =>
  override ?? process.env.KEEPITMOVIN_HOME ?? path.join(os.homedir(), ".keepitmovin");

const trustStorePath = (home: string): string => path.join(home, TRUST_STORE_FILE);

const readTrustStore = async (home: string): Promise<Record<string, string>> => {
  try {
    const raw = await readFile(trustStorePath(home), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
  } catch {
    // Missing or corrupt store — treat as empty (nothing trusted yet).
  }
  return {};
};

const recordConfigTrust = async (
  home: string,
  configPath: string,
  hash: string
): Promise<void> => {
  const store = await readTrustStore(home);
  store[path.resolve(configPath)] = hash;
  await mkdir(home, { recursive: true, mode: 0o700 });
  await writeFile(trustStorePath(home), `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: ARTIFACT_FILE_MODE
  });
};

/**
 * Records trust for a config file non-interactively by hashing its current
 * contents. Useful for pre-approving a known-good custom config (e.g. in CI).
 */
export const trustConfigFile = async (
  configPath: string,
  home?: string
): Promise<void> => {
  const raw = await readFile(configPath, "utf8");
  await recordConfigTrust(resolveKeepitmovinHome(home), configPath, hashConfig(raw));
};

const describeProviders = (providers: InteractiveProviderConfig[]): string =>
  providers
    .map((provider) => {
      const argsText = provider.args.length > 0 ? ` ${provider.args.join(" ")}` : "";
      return `  - ${provider.label} (${provider.name}): ${provider.command}${argsText}`;
    })
    .join("\n");

const defaultConfirm = async (
  providers: InteractiveProviderConfig[],
  configPath: string
): Promise<boolean> => {
  const answer = await confirm({
    message:
      `${configPath} defines custom tool commands that keepitmovin would run:\n` +
      `${describeProviders(providers)}\n` +
      "Only trust this if you recognize these commands. Run them?"
  });
  return !isCancel(answer) && answer === true;
};

export interface AssertConfigTrustedOptions {
  config: KeepitmovinConfig;
  /** Absolute path of the loaded config file, or undefined when using built-in defaults. */
  configPath?: string;
  /** Whether we can prompt (a TTY is attached). */
  interactive: boolean;
  /** Injectable for tests; defaults to a clack confirm prompt. */
  confirm?: (
    providers: InteractiveProviderConfig[],
    configPath: string
  ) => Promise<boolean>;
  /** Override the trust-store home (tests); defaults to KEEPITMOVIN_HOME / ~/.keepitmovin. */
  home?: string;
}

/**
 * Gate that must run before any code executes a config-derived command. Trusts
 * built-in defaults and catalog-only configs automatically. For a config that
 * introduces custom provider commands, it requires one-time interactive consent
 * (persisted as a SHA-256 of the config file under the user's home, never the
 * repo) and re-prompts if the file changes. Refuses outright when non-interactive.
 *
 * @throws {UntrustedConfigError} when the config is not (and cannot be) trusted.
 */
export const assertConfigTrusted = async (
  options: AssertConfigTrustedOptions
): Promise<void> => {
  const customProviders = computeCustomProviders(options.config);
  if (customProviders.length === 0) {
    return;
  }

  // Custom providers can only reach here via a config file (defaults are
  // catalog-only), but guard anyway.
  if (!options.configPath) {
    return;
  }

  const home = resolveKeepitmovinHome(options.home);
  const raw = await readFile(options.configPath, "utf8");
  const hash = hashConfig(raw);
  const store = await readTrustStore(home);

  if (store[path.resolve(options.configPath)] === hash) {
    return;
  }

  const commandList = describeProviders(customProviders);

  if (!options.interactive) {
    throw new UntrustedConfigError(
      `${options.configPath} defines custom tool commands that keepitmovin will not run without your consent:\n` +
        `${commandList}\n` +
        "Run `kim` in an interactive terminal once to review and trust them."
    );
  }

  const confirmFn = options.confirm ?? defaultConfirm;
  const approved = await confirmFn(customProviders, options.configPath);

  if (!approved) {
    throw new UntrustedConfigError(
      "keepitmovin will not run untrusted custom tool commands. Aborting."
    );
  }

  await recordConfigTrust(home, options.configPath, hash);
};
