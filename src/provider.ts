import { execa } from "execa";
import { classifyError } from "./errors.js";
import { getChangedFiles } from "./git.js";
import type { ProviderConfig, ProviderResult, ProviderRunOptions } from "./types.js";

const renderArg = (arg: string, prompt: string, cwd: string): string =>
  arg.replaceAll("{{prompt}}", prompt).replaceAll("{{cwd}}", cwd);

export const runProvider = async (
  provider: ProviderConfig,
  options: ProviderRunOptions
): Promise<ProviderResult> => {
  const startedAt = Date.now();
  const args = provider.args.map((arg) => renderArg(arg, options.prompt, options.cwd));

  try {
    const result = await execa(provider.command, args, {
      cwd: options.cwd,
      reject: false,
      timeout: provider.timeoutMs,
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true
    });
    const durationMs = Date.now() - startedAt;
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();
    const exitCode = result.exitCode ?? null;
    const errorType = classifyError(stdout, stderr, exitCode);

    return {
      provider: provider.name,
      success: exitCode === 0,
      exitCode,
      stdout,
      stderr,
      durationMs,
      errorType,
      changedFiles: await getChangedFiles(options.cwd)
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const maybeError = error as {
      code?: string;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      timedOut?: boolean;
      shortMessage?: string;
      message?: string;
    };
    const stdout = maybeError.stdout?.trim() ?? "";
    const stderr = (maybeError.stderr ?? maybeError.shortMessage ?? maybeError.message ?? "").trim();
    const commandNotFound = maybeError.code === "ENOENT";
    const exitCode = typeof maybeError.exitCode === "number" ? maybeError.exitCode : null;
    const errorType = classifyError(stdout, stderr, exitCode, {
      timedOut: maybeError.timedOut,
      commandNotFound
    });

    return {
      provider: provider.name,
      success: false,
      exitCode,
      stdout,
      stderr,
      durationMs,
      errorType,
      changedFiles: await getChangedFiles(options.cwd)
    };
  }
};
