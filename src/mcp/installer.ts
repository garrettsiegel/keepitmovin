import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { confirm, isCancel } from "@clack/prompts";
import {
  getMcpClientStatuses,
  type McpClientDefinition,
  type McpClientName,
  type McpClientStatus,
  type McpCommandRunner,
  defaultMcpCommandRunner
} from "./clients.js";

export interface McpInstallResult {
  name: McpClientName;
  label: string;
  state: "installed" | "removed" | "skipped" | "failed";
  detail: string;
}

export interface McpInstallerOptions {
  homeDir?: string;
  entrypoint?: string;
  runCommand?: McpCommandRunner;
  confirm?: (message: string) => Promise<boolean>;
}

export const resolveMcpServerCommand = (entrypoint?: string): string[] => {
  const target = entrypoint ?? process.argv[1];
  if (!target) throw new Error("Cannot resolve the keepitmovin CLI entrypoint");
  return [process.execPath, path.resolve(target), "mcp", "serve"];
};

const defaultConfirm = async (message: string): Promise<boolean> => {
  const answer = await confirm({ message });
  return !isCancel(answer) && answer === true;
};

const readConfig = async (file: string): Promise<{ value: Record<string, unknown>; existed: boolean }> => {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${file} does not contain a JSON object`);
    }
    return { value: parsed as Record<string, unknown>, existed: true };
  } catch (error) {
    const value = error as NodeJS.ErrnoException;
    if (value.code === "ENOENT") return { value: {}, existed: false };
    throw error;
  }
};

const backupName = (file: string): string =>
  `${file}.keepitmovin-backup-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;

const atomicWrite = async (file: string, value: Record<string, unknown>): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.keepitmovin-tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, file);
};

const directEntry = (client: McpClientDefinition, server: string[]): Record<string, unknown> =>
  client.configRoot === "mcp"
    ? { type: "local", command: server, enabled: true }
    : { command: server[0], args: server.slice(1), env: {} };

const editDirectConfig = async (args: {
  client: McpClientDefinition;
  home: string;
  server: string[];
  operation: "install" | "remove";
}): Promise<string> => {
  const file = args.client.configPath!(args.home);
  const { value, existed } = await readConfig(file);
  const rootName = args.client.configRoot!;
  const currentRoot = value[rootName];
  if (currentRoot !== undefined && (!currentRoot || typeof currentRoot !== "object" || Array.isArray(currentRoot))) {
    throw new Error(`${file} has a malformed ${rootName} section`);
  }
  const root = { ...(currentRoot as Record<string, unknown> | undefined) };
  if (args.operation === "remove" && !("keepitmovin" in root)) return "not installed";
  if (args.operation === "install") root.keepitmovin = directEntry(args.client, args.server);
  else delete root.keepitmovin;

  const backup = existed ? backupName(file) : undefined;
  if (backup) await copyFile(file, backup);
  try {
    await atomicWrite(file, { ...value, [rootName]: root });
  } catch (error) {
    if (backup) await copyFile(backup, file);
    else await unlink(file).catch(() => undefined);
    throw error;
  }
  return backup ? `${file} (backup: ${backup})` : file;
};

const actionable = (status: McpClientStatus, operation: "install" | "remove"): boolean =>
  operation === "install"
    ? status.state === "ready" || status.state === "installed"
    : status.state === "installed";

export const previewMcpChanges = (
  statuses: McpClientStatus[],
  operation: "install" | "remove",
  server = resolveMcpServerCommand(),
  home = os.homedir()
): string[] => statuses.filter((status) => actionable(status, operation)).map((status) => {
  if (status.definition.strategy === "native") {
    const args = operation === "install"
      ? status.definition.nativeAdd!(server)
      : status.definition.nativeRemove!;
    return `${status.label}: ${status.definition.command} ${args.join(" ")}`;
  }
  return `${status.label}: ${operation} keepitmovin in ${status.definition.configPath!(home)}`;
});

export const changeMcpInstallations = async (
  operation: "install" | "remove",
  options: McpInstallerOptions = {}
): Promise<McpInstallResult[]> => {
  const home = options.homeDir ?? os.homedir();
  const run = options.runCommand ?? defaultMcpCommandRunner;
  const statuses = await getMcpClientStatuses({ homeDir: home, runCommand: run });
  const server = resolveMcpServerCommand(options.entrypoint);
  const targets = statuses.filter((status) => actionable(status, operation));
  const preview = previewMcpChanges(targets, operation, server, home)
    .map((line) => `  - ${line}`)
    .join("\n");
  if (targets.length > 0) {
    const approved = await (options.confirm ?? defaultConfirm)(
      `${operation === "install" ? "Install" : "Remove"} the keepitmovin MCP entry?\n${preview}`
    );
    if (!approved) return statuses.map((status) => ({
      name: status.name, label: status.label, state: "skipped", detail: "not approved"
    }));
  }

  const results: McpInstallResult[] = [];
  for (const status of statuses) {
    if (!actionable(status, operation)) {
      results.push({ name: status.name, label: status.label, state: "skipped", detail: status.detail });
      continue;
    }
    try {
      if (status.definition.strategy === "native") {
        const args = operation === "install"
          ? status.definition.nativeAdd!(server)
          : status.definition.nativeRemove!;
        const changed = await run(status.definition.command!, args);
        if (changed.exitCode !== 0) throw new Error(changed.output || "client command failed");
        results.push({
          name: status.name, label: status.label,
          state: operation === "install" ? "installed" : "removed",
          detail: "client configuration updated"
        });
      } else {
        const detail = await editDirectConfig({
          client: status.definition, home, server, operation
        });
        results.push({
          name: status.name, label: status.label,
          state: operation === "install" ? "installed" : "removed", detail
        });
      }
    } catch (error) {
      results.push({
        name: status.name, label: status.label, state: "failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return results;
};
