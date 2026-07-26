import { z } from "zod";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureArtifactsIgnored } from "../util/gitignore-marker.js";
import type { KeepitmovinConfig } from "./types.js";
import {
  mergeCatalogInteractiveProviders,
  reconcileProviderOrder
} from "../providers/catalog.js";
import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_HANDOFF_ARCHIVE_DIR,
  DEFAULT_HANDOFF_PATH,
  DEFAULT_KEEPITMOVIN_DIR,
  DEFAULT_SESSIONS_DIR,
  keepitmovinConfigSchema
} from "./config-schema.js";

// Re-exported so existing importers keep working.
export * from "./config-schema.js";
/**
 * Writes the `.keepitmovin/.gitignore` marker so handoff files and session logs
 * (which contain terminal output and git diffs) never get committed to the
 * user's repo. Prints a one-time notice when it first creates the marker.
 */
export const ensureKeepitmovinIgnored = async (cwd: string): Promise<void> => {
  const created = await ensureArtifactsIgnored(path.join(cwd, DEFAULT_KEEPITMOVIN_DIR));
  if (created) {
    console.log(
      "keepitmovin: added .keepitmovin/.gitignore so local handoff and session artifacts stay out of git."
    );
  }
};

const normalizeConfig = (config: KeepitmovinConfig): KeepitmovinConfig => {
  const providers = mergeCatalogInteractiveProviders(config.harness.providers);
  return keepitmovinConfigSchema.parse({
    ...config,
    harness: {
      ...config.harness,
      providers,
      providerOrder: reconcileProviderOrder(
        config.harness.providers,
        providers,
        config.harness.providerOrder
      )
    }
  });
};

export const defaultConfig = (): KeepitmovinConfig => normalizeConfig(keepitmovinConfigSchema.parse({}));

export const resolveConfigPath = (cwd: string, configPath?: string): string => {
  if (!configPath) {
    return path.join(cwd, DEFAULT_CONFIG_FILE);
  }

  return path.isAbsolute(configPath) ? configPath : path.join(cwd, configPath);
};

export const loadConfig = async (
  cwd: string,
  configPath?: string
): Promise<{ config: KeepitmovinConfig; path?: string }> => {
  const resolvedPath = resolveConfigPath(cwd, configPath);

  try {
    await access(resolvedPath);
  } catch {
    if (configPath) {
      throw new Error(`keepitmovin config not found: ${resolvedPath}`);
    }

    return { config: defaultConfig() };
  }

  const raw = await readFile(resolvedPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    // A bare SyntaxError names neither the file nor what to do about it, and via
    // the MCP server it surfaced to clients as an opaque failure.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`keepitmovin config is not valid JSON: ${resolvedPath}\n  ${detail}`);
  }
  // Same reasoning as the JSON branch above: a raw ZodError dumps an issue array
  // with no indication of which file it came from, and reaches MCP clients as an
  // opaque failure. prettifyError renders the issues as readable lines.
  const result = keepitmovinConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `keepitmovin config is not valid: ${resolvedPath}\n${z.prettifyError(result.error)}`
    );
  }

  return { config: normalizeConfig(result.data), path: resolvedPath };
};

export const saveConfig = async (
  cwd: string,
  config: KeepitmovinConfig,
  configPath?: string
): Promise<string> => {
  const resolvedPath = resolveConfigPath(cwd, configPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_KEEPITMOVIN_DIR), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_SESSIONS_DIR), { recursive: true });
  await mkdir(path.dirname(path.join(cwd, DEFAULT_HANDOFF_PATH)), { recursive: true });
  await mkdir(path.join(cwd, DEFAULT_HANDOFF_ARCHIVE_DIR), { recursive: true });
  await ensureKeepitmovinIgnored(cwd);
  await writeFile(
    resolvedPath,
    `${JSON.stringify(keepitmovinConfigSchema.parse(config), null, 2)}\n`,
    "utf8"
  );
  return resolvedPath;
};
