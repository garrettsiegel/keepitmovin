import path from "node:path";
import { isFallbackEligible, loadConfig } from "./config.js";
import { buildTaskContext } from "./context.js";
import { createCheckpointCommit, getChangedFiles } from "./git.js";
import { writeRunLog } from "./logger.js";
import { buildPrompt } from "./prompt.js";
import { runProvider } from "./provider.js";
import type {
  ProviderConfig,
  ProviderName,
  RunAttemptLog,
  RunLog,
  RunOptions,
  RunSummary
} from "./types.js";

const selectProviders = (
  providers: ProviderConfig[],
  providerName?: ProviderName
): ProviderConfig[] => {
  if (providerName) {
    const provider = providers.find((entry) => entry.name === providerName);
    if (!provider) {
      throw new Error(`Provider not found in config: ${providerName}`);
    }

    return [provider];
  }

  return providers.filter((provider) => provider.enabled);
};

const toAttemptLog = (
  result: Awaited<ReturnType<typeof runProvider>>,
  prompt: string,
  startedAt: string,
  endedAt: string
): RunAttemptLog => ({
  ...result,
  prompt,
  startedAt,
  endedAt
});

export const runCodePass = async (
  task: string,
  options: RunOptions
): Promise<RunSummary> => {
  const cwd = path.resolve(options.cwd);
  const startedAt = new Date().toISOString();
  const loaded = await loadConfig(cwd, options.configPath);
  const config = loaded.config;
  const providers = selectProviders(config.providers, options.provider);
  const maxRetries = options.maxRetries ?? config.maxRetries;
  const attempts: RunAttemptLog[] = [];
  const providerOrder = providers.map((provider) => provider.name);
  let success = false;
  let finalProvider: ProviderName | undefined;

  if (providers.length === 0) {
    throw new Error("No enabled CodePass providers found.");
  }

  if (config.git.createCheckpointCommit && !options.dryRun) {
    // Local-only safety commit so the user can recover the pre-run state.
    // Never pushed; returns undefined when there is nothing to commit.
    await createCheckpointCommit(cwd, `codepass: checkpoint before "${task}"`);
  }

  if (config.git.requireCleanWorkingTree) {
    const changedFiles = await getChangedFiles(cwd);
    if (changedFiles.length > 0) {
      throw new Error(
        `Working tree must be clean before CodePass can run. Changed files: ${changedFiles.join(", ")}`
      );
    }
  }

  if (options.dryRun) {
    const context = await buildTaskContext(task, cwd, config, attempts);
    const prompt = buildPrompt(context);
    const dryRunAttempt: RunAttemptLog = {
      provider: "dry-run",
      success: true,
      exitCode: 0,
      stdout: prompt,
      stderr: "",
      durationMs: 0,
      changedFiles: await getChangedFiles(cwd),
      prompt,
      startedAt,
      endedAt: new Date().toISOString()
    };
    attempts.push(dryRunAttempt);
    success = true;
    finalProvider = "dry-run";
  } else {
    for (const provider of providers) {
      for (let retryIndex = 0; retryIndex <= maxRetries; retryIndex += 1) {
        const context = await buildTaskContext(task, cwd, config, attempts);
        const prompt = buildPrompt(context);
        const attemptStartedAt = new Date().toISOString();
        options.onAttemptStart?.(provider.name, retryIndex);
        const result = await runProvider(provider, { cwd, prompt });
        const attempt = toAttemptLog(
          result,
          prompt,
          attemptStartedAt,
          new Date().toISOString()
        );
        attempts.push(attempt);
        options.onAttemptEnd?.(attempt);

        if (result.success) {
          success = true;
          finalProvider = provider.name;
          break;
        }

        const canRetryProvider =
          retryIndex < maxRetries &&
          isFallbackEligible(result.errorType, config.fallbackOn, provider.fallbackOn);

        if (!canRetryProvider) {
          break;
        }
      }

      const latestAttempt = attempts.at(-1);
      if (success) {
        break;
      }

      const canFallback =
        latestAttempt &&
        isFallbackEligible(latestAttempt.errorType, config.fallbackOn, provider.fallbackOn);

      if (!canFallback) {
        break;
      }
    }
  }

  const endedAt = new Date().toISOString();
  const changedFiles = await getChangedFiles(cwd);
  const providersTried = [
    ...new Set(attempts.map((attempt) => attempt.provider))
  ];
  const log: RunLog = {
    task,
    cwd,
    configPath: loaded.path,
    startedAt,
    endedAt,
    providerOrder,
    providersTried,
    finalProvider,
    success,
    dryRun: options.dryRun,
    changedFiles,
    attempts
  };
  const logPath = await writeRunLog(cwd, config, log);

  return {
    task,
    cwd,
    success,
    dryRun: options.dryRun,
    providerOrder,
    providersTried,
    finalProvider,
    changedFiles,
    attempts,
    logPath
  };
};
