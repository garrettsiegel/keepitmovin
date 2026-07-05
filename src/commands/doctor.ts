import chalk from "chalk";
import ora from "ora";
import { runDoctor } from "../doctor.js";
import type { CliOptions } from "../cli-options.js";

export const runDoctorCommand = async (options: CliOptions): Promise<void> => {
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
    console.log(chalk.bold("Sessions dir:"), summary.sessionsDir);

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

    if (summary.usageProbes.length > 0) {
      console.log("");
      console.log(chalk.bold("Usage probes:"));
      for (const probe of summary.usageProbes) {
        if (!probe.snapshot) {
          console.log(chalk.gray(`- ${probe.label}: no recent session data found`));
          continue;
        }

        const { snapshot } = probe;
        const parts: string[] = [];
        if (snapshot.primaryUsedPercent !== undefined) {
          parts.push(`5-hour ${Math.round(snapshot.primaryUsedPercent)}%`);
        }
        if (snapshot.secondaryUsedPercent !== undefined) {
          parts.push(`weekly ${Math.round(snapshot.secondaryUsedPercent)}%`);
        }
        console.log(
          chalk.gray(`- ${probe.label}: ${parts.join(" / ")} (source: ${snapshot.sourceFile})`)
        );
      }
    }

    console.log("");
    if (summary.readyInteractiveProviderCount > 0) {
      console.log(chalk.green(`Ready harness providers: ${summary.readyInteractiveProviderCount}`));
      console.log(chalk.gray("Next: run `codepass` to start the harness."));
    } else {
      console.log(chalk.red("No enabled harness providers are available on PATH."));
      process.exitCode = 1;
    }
  } catch (error) {
    spinner.fail("CodePass setup check failed.");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};
