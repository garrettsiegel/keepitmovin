#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import { confirm, select } from "@inquirer/prompts";
import ora from "ora";
import { initConfig, loadConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { clearHandoffArtifacts, summarizeHandoffFile } from "./handoff-file.js";
import { runHarness } from "./harness.js";
import { describeProviderChain, getEnabledInteractiveProviders } from "./interactive-provider.js";
import { runCodePass } from "./run.js";
import { readLatestSessionLog } from "./session-log.js";
import { getSetupState, runSetupWizard } from "./setup.js";
import { renderHarnessStart } from "./terminal-ui.js";
import { ensureProviderFreshness } from "./updates.js";
import type { CodePassConfig, RunAttemptLog } from "./types.js";

interface CliOptions {
  all?: boolean;
  config?: string;
  cwd?: string;
  dryRun?: boolean;
  maxRetries?: string;
  printPrompt?: boolean;
  provider?: string;
}

const resolveCommandOptions = (
  rawOptions: CliOptions | Command,
  command?: Command
): CliOptions => {
  const commandCandidate = command ?? (rawOptions instanceof Command ? rawOptions : undefined);
  const parsedOptions = commandCandidate?.opts<CliOptions>() ?? rawOptions as CliOptions;

  return {
    ...parsedOptions,
    config: readOptionFromArgv(["--config", "-c"]) ?? parsedOptions.config,
    cwd: readOptionFromArgv(["--cwd"]) ?? parsedOptions.cwd
  };
};

const readOptionFromArgv = (names: string[]): string | undefined => {
  for (const [index, arg] of process.argv.entries()) {
    for (const name of names) {
      if (arg === name) {
        return process.argv[index + 1];
      }

      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1);
      }
    }
  }

  return undefined;
};

const parseMaxRetries = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("--max-retries must be a non-negative integer");
  }

  return parsed;
};

const formatAttempt = (attempt: RunAttemptLog): string => {
  const status = attempt.success ? chalk.green("OK") : chalk.red("FAIL");
  const reason = attempt.success ? "" : ` (${attempt.errorType ?? "unknown"})`;
  return `${status} ${attempt.provider}${reason} in ${attempt.durationMs}ms`;
};

const normalizeArgv = (argv: string[]): string[] => {
  const normalizedArgv =
    argv[2] === "--" ? [argv[0] ?? "node", argv[1] ?? "codepass", ...argv.slice(3)] : argv;
  const firstArg = normalizedArgv[2];
  const explicitCommands = new Set(["clear", "handoff", "init", "doctor", "providers", "run", "session", "setup", "help"]);

  if (!firstArg || firstArg.startsWith("-") || explicitCommands.has(firstArg)) {
    return normalizedArgv;
  }

  return [
    normalizedArgv[0] ?? "node",
    normalizedArgv[1] ?? "codepass",
    "run",
    ...normalizedArgv.slice(2)
  ];
};

// On `codepass`, decide which config to launch with. First run → wizard. Otherwise
// confirm the saved chain (reuse / reconfigure / start fresh). Non-interactive
// stdin reuses saved preferences without prompting.
const resolveLaunchConfig = async (
  loadedConfig: CodePassConfig,
  cwd: string,
  configPath?: string
): Promise<CodePassConfig> => {
  if (!loadedConfig.harness.setupComplete) {
    return (await runSetupWizard({ cwd, configPath })).config;
  }

  if (!process.stdin.isTTY) {
    return loadedConfig;
  }

  const enabled = getEnabledInteractiveProviders(loadedConfig);
  const chain = enabled.length > 0 ? describeProviderChain(enabled) : "(no enabled tools)";
  console.log(`${chalk.bold("Saved chain:")} ${chain}`);

  const choice = await select({
    message: "Start with this chain?",
    choices: [
      { name: "Yes, launch", value: "launch" },
      { name: "Reconfigure (choose tools/order)", value: "reconfigure" },
      { name: "Start fresh (ignore saved preferences)", value: "fresh" }
    ],
    default: "launch"
  });

  if (choice === "launch") {
    return loadedConfig;
  }

  return (await runSetupWizard({
    cwd,
    configPath,
    force: true,
    reset: choice === "fresh"
  })).config;
};

const program = new Command();

program
  .name("codepass")
  .description("Interactive agent harness for Claude Code, Codex, Antigravity, opencode, Cline, and more.")
  .version("0.0.1");

program
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (options: CliOptions) => {
    const cwd = options.cwd ?? process.cwd();

    try {
      const loaded = await loadConfig(cwd, options.config);
      const config = await resolveLaunchConfig(loaded.config, cwd, options.config);
      const providers = getEnabledInteractiveProviders(config);
      const setupState = await getSetupState(cwd, options.config);
      const availabilityByName = new Map(
        setupState.toolStatuses.map((status) => [status.name, status.available])
      );
      const providersAvailableOnPath = providers.filter((provider) =>
        availabilityByName.get(provider.name) ?? false
      );
      const missingSelectedProviders = providers.filter((provider) =>
        !availabilityByName.get(provider.name)
      );

      for (const provider of missingSelectedProviders) {
        console.log(chalk.yellow(`${provider.label} is not installed or not on PATH. CodePass will skip it for this session.`));
      }

      if (providersAvailableOnPath.length === 0) {
        throw new Error("CodePass did not find any launchable tools in your selected stack. Run `codepass providers` to choose installed tools.");
      }

      const freshness = await ensureProviderFreshness({
        cwd,
        config,
        providers: providersAvailableOnPath,
        interactive: true
      });
      const missingProviders = new Set(
        freshness
          .filter((result) => result.action === "missing")
          .map((result) => result.provider)
      );
      const launchableProviders = providersAvailableOnPath.filter((provider) => !missingProviders.has(provider.name));

      if (launchableProviders.length === 0) {
        throw new Error("CodePass did not find any launchable tools in your selected stack. Run `codepass providers` to choose installed tools.");
      }

      console.log(renderHarnessStart(launchableProviders));

      await runHarness({
        cwd,
        config,
        providers: launchableProviders,
        input: process.stdin,
        output: process.stdout
      });
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program
  .command("init")
  .description("Create CodePass config and local run log directories.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command);

    try {
      const result = await initConfig(options.cwd ?? process.cwd(), options.config);
      const status = result.createdConfig ? "created" : "already exists";
      console.log(chalk.green(`CodePass config ${status}: ${result.configPath}`));
      console.log(chalk.gray("Created .codepass/runs and .codepass/logs if needed."));
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program
  .command("doctor")
  .description("Check CodePass config, provider commands, git context, and log paths.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--all", "Show the full popular provider catalog")
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command);
    const spinner = ora("Checking CodePass setup...").start();

    try {
      const summary = await runDoctor(options.cwd ?? process.cwd(), options.config, {
        includeAllCatalog: options.all ?? false
      });
      spinner.succeed("CodePass setup check complete.");

      console.log("");
      console.log(chalk.bold("Working directory:"), summary.cwd);
      console.log(
        chalk.bold("Config:"),
        summary.usingDefaultConfig
          ? `${summary.configPath} ${chalk.gray("(not found; using built-in defaults)")}`
          : summary.configPath
      );
      console.log(chalk.bold("Git repo:"), summary.gitRepo ? "yes" : "no");
      console.log(chalk.bold("Changed files:"), summary.changedFiles.length);
      console.log(chalk.bold("Runs dir:"), summary.runsDir);
      console.log(chalk.bold("Logs dir:"), summary.logsDir);
      console.log(chalk.bold("Sessions dir:"), summary.sessionsDir);

      console.log("");
      console.log(chalk.bold("Providers:"));
      for (const provider of summary.providerHealth) {
        const enabled = provider.enabled ? "enabled" : "disabled";
        const status = provider.available
          ? chalk.green("ready")
          : provider.enabled
            ? chalk.yellow("needs setup")
            : chalk.blue("add later");
        console.log(
          `- ${provider.name}: ${enabled}, ${status} (${provider.command}) - ${provider.detail}`
        );
      }

      console.log("");
      console.log(chalk.bold("Harness providers:"));
      for (const provider of summary.interactiveProviderHealth) {
        const enabled = provider.enabled ? "enabled" : "disabled";
        const status = provider.available ? chalk.green("ready") : chalk.blue("add later");
        console.log(
          `- ${provider.label ?? provider.name}: ${enabled}, ${status} (${provider.command}) - ${provider.detail}`
        );
      }

      if (summary.catalogProviderHealth.length > 0) {
        console.log("");
        console.log(chalk.bold("Popular provider catalog:"));
        for (const provider of summary.catalogProviderHealth) {
          const integration = provider.group === "guided" || provider.controllable === false
            ? chalk.blue(provider.integrationType ?? "guided")
            : provider.available
              ? chalk.green("ready")
              : chalk.blue("add later");
          const configured = provider.configured ? chalk.gray("configured") : chalk.gray("not configured");
          console.log(
            `- ${provider.label ?? provider.name}: ${integration}, ${configured} (${provider.command}) - ${provider.detail}`
          );
          if (provider.limitation) {
            console.log(chalk.gray(`  ${provider.limitation}`));
          }
        }
      }

      console.log("");
      if (summary.readyInteractiveProviderCount > 0) {
        console.log(chalk.green(`Ready harness providers: ${summary.readyInteractiveProviderCount}`));
        console.log(chalk.gray("Next: run `codepass` to start the harness or `codepass run \"your task\" --dry-run` to preview task mode."));
      } else {
        console.log(chalk.red("No enabled harness providers are available on PATH."));
        process.exitCode = 1;
      }
    } catch (error) {
      spinner.fail("CodePass setup check failed.");
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program
  .command("handoff")
  .description("Show the current CodePass handoff file path and preview.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command);

    try {
      const cwd = options.cwd ?? process.cwd();
      const { config } = await loadConfig(cwd, options.config);
      const handoff = await summarizeHandoffFile(cwd, config);

      console.log(chalk.bold("CodePass handoff file"));
      console.log("Path:", handoff.path);
      console.log("Status:", handoff.exists ? chalk.green("exists") : chalk.yellow("not created yet"));
      console.log("");
      console.log(handoff.summary);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program
  .command("clear")
  .description("Delete local CodePass handoff and harness session artifacts.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--yes", "Skip confirmation")
  .action(async (rawOptions: (CliOptions & { yes?: boolean }) | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command) as CliOptions & { yes?: boolean };

    try {
      const cwd = options.cwd ?? process.cwd();
      const { config } = await loadConfig(cwd, options.config);
      const shouldClear = options.yes ?? await confirm({
        message: "Delete local CodePass handoffs and harness session logs?",
        default: false
      });

      if (!shouldClear) {
        console.log("CodePass clear cancelled.");
        return;
      }

      const removed = await clearHandoffArtifacts(cwd, config);
      console.log(
        removed.length > 0
          ? chalk.green(`Cleared ${removed.length} CodePass artifact location(s).`)
          : chalk.gray("No CodePass handoff/session artifacts found.")
      );
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program
  .command("setup")
  .description("Run the guided CodePass harness setup wizard.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command);

    try {
      await runSetupWizard({
        cwd: options.cwd ?? process.cwd(),
        configPath: options.config,
        force: true
      });
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program
  .command("providers")
  .description("Edit the CodePass harness provider order.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--all", "Browse the full popular provider catalog while editing")
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command);

    try {
      await runSetupWizard({
        cwd: options.cwd ?? process.cwd(),
        configPath: options.config,
        force: true,
        showAllCatalog: options.all ?? false
      });
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program
  .command("session")
  .description("Show the latest CodePass harness session summary.")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (rawOptions: CliOptions | Command, command?: Command) => {
    const options = resolveCommandOptions(rawOptions, command);

    try {
      const cwd = options.cwd ?? process.cwd();
      const { config } = await loadConfig(cwd, options.config);
      const latest = await readLatestSessionLog(cwd, config);

      if (!latest) {
        console.log(chalk.yellow("No CodePass harness sessions found yet."));
        return;
      }

      console.log(chalk.bold("Latest CodePass session"));
      console.log("Started:", latest.startedAt);
      console.log("Ended:", latest.endedAt);
      console.log("Providers:", latest.providerOrder.join(" -> "));
      console.log("Attempts:", latest.attempts.length);
      console.log("Changed files:", latest.changedFiles.length);
      console.log("Log:", latest.sessionLogPath ?? "(unknown)");
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

program
  .command("run")
  .description("Run a task through the configured fallback chain.")
  .argument("[task]", "Task to run through the fallback chain")
  .option("-c, --config <path>", "Config file path")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--dry-run", "Build and log the handoff prompt without invoking a provider")
  .option("--max-retries <count>", "Retry each fallback-eligible provider before moving on")
  .option("--print-prompt", "Print the generated handoff prompt after the run")
  .option("--provider <name>", "Run only one configured provider by name")
  .action(async (task: string | undefined, options: CliOptions) => {
    const resolvedOptions: CliOptions = {
      ...options,
      config: readOptionFromArgv(["--config", "-c"]) ?? options.config,
      cwd: readOptionFromArgv(["--cwd"]) ?? options.cwd
    };

    if (!task) {
      program.help({ error: true });
      return;
    }

    const spinner = ora("Preparing CodePass handoff...").start();

    try {
      const summary = await runCodePass(task, {
        cwd: resolvedOptions.cwd ?? process.cwd(),
        configPath: resolvedOptions.config,
        dryRun: resolvedOptions.dryRun ?? false,
        provider: resolvedOptions.provider,
        maxRetries: parseMaxRetries(resolvedOptions.maxRetries),
        onAttemptStart: (provider, retryIndex) => {
          const retryLabel = retryIndex > 0 ? ` retry ${retryIndex}` : "";
          spinner.text = `Trying ${provider}${retryLabel}...`;
        },
        onAttemptEnd: (attempt) => {
          spinner.text = `${attempt.provider} finished: ${
            attempt.success ? "success" : attempt.errorType ?? "failed"
          }`;
        }
      });

      if (summary.success) {
        spinner.succeed(
          summary.dryRun
            ? "CodePass dry run completed."
            : `CodePass completed with ${summary.finalProvider ?? "unknown provider"}.`
        );
      } else {
        spinner.fail("CodePass exhausted the fallback chain.");
      }

      console.log("");
      console.log(chalk.bold("Task:"), summary.task);
      console.log(chalk.bold("Providers:"), summary.providerOrder.join(" -> "));
      console.log(chalk.bold("Tried:"), summary.providersTried.join(", "));

      console.log("");
      console.log(chalk.bold("Attempt results:"));
      for (const attempt of summary.attempts) {
        console.log(`- ${formatAttempt(attempt)}`);
      }

      if (summary.changedFiles.length > 0) {
        console.log("");
        console.log(chalk.bold("Changed files:"));
        for (const file of summary.changedFiles) {
          console.log(`- ${file}`);
        }
      }

      console.log("");
      console.log(chalk.bold("Run log:"), summary.logPath ?? "(not written)");

      if (resolvedOptions.printPrompt) {
        const latestPrompt = summary.attempts.at(-1)?.prompt;
        if (latestPrompt) {
          console.log("");
          console.log(chalk.bold("Generated handoff prompt:"));
          console.log(latestPrompt);
        }
      }

      if (summary.dryRun) {
        console.log(chalk.gray("Dry run only: no provider was invoked."));
      }

      if (!summary.success) {
        const latest = summary.attempts.at(-1);
        if (latest) {
          console.log("");
          console.log(chalk.bold("Last failure:"), `${latest.provider} (${latest.errorType ?? "unknown"})`);
        }
        process.exitCode = 1;
      }
    } catch (error) {
      spinner.fail("CodePass failed before the fallback chain finished.");
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

await program.parseAsync(normalizeArgv(process.argv));
