import chalk from "chalk";
import { getMcpClientStatuses } from "../mcp/clients.js";
import { changeMcpInstallations } from "../mcp/installer.js";

export const runMcpServeCommand = async (options: {
  cwd?: string;
  version: string;
}): Promise<void> => {
  // Someone running `movin mcp` by hand otherwise just sees a hung terminal.
  if (process.stdin.isTTY) {
    process.stderr.write(
      "keepitmovin MCP server is waiting on stdin — it's meant to be launched by an MCP client. Run `movin mcp install` to set that up; Ctrl+C to exit.\n"
    );
  }
  // Loaded here, not at the top: the MCP SDK is the heaviest dependency and
  // every other `movin` command would pay for it at startup.
  const { serveKeepitmovinMcp } = await import("../mcp/server.js");
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
