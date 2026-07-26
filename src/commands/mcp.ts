import chalk from "chalk";
import { getMcpClientStatuses } from "../mcp/clients.js";
import { changeMcpInstallations } from "../mcp/installer.js";
import { serveKeepitmovinMcp } from "../mcp/server.js";

export const runMcpServeCommand = async (options: {
  cwd?: string;
  version: string;
}): Promise<void> => {
  await serveKeepitmovinMcp({ cwd: options.cwd, version: options.version });
};

export const runMcpStatusCommand = async (): Promise<void> => {
  const statuses = await getMcpClientStatuses();
  console.log(chalk.bold("keepitmovin MCP clients"));
  for (const status of statuses) {
    const color = status.state === "installed"
      ? chalk.green
      : status.state === "ready"
        ? chalk.cyan
        : status.state === "failed"
          ? chalk.red
          : chalk.yellow;
    console.log(`${status.label}: ${color(status.state)} — ${status.detail}`);
  }
};

export const runMcpChangeCommand = async (operation: "install" | "remove"): Promise<void> => {
  const results = await changeMcpInstallations(operation);
  for (const result of results) {
    const color = result.state === "failed"
      ? chalk.red
      : result.state === "skipped"
        ? chalk.yellow
        : chalk.green;
    console.log(`${result.label}: ${color(result.state)} — ${result.detail}`);
  }
  if (results.some((result) => result.state === "failed")) process.exitCode = 1;
};
