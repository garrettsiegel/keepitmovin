import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";

export type McpClientName =
  | "claude" | "codex" | "cursor" | "kimi" | "antigravity"
  | "opencode" | "grok" | "copilot" | "ollama";
export type McpClientState =
  | "ready" | "installed" | "missing" | "upgrade_required" | "unsupported" | "failed";
export type McpClientStrategy = "native" | "json" | "unsupported";

export interface McpClientDefinition {
  name: McpClientName;
  label: string;
  command?: string;
  strategy: McpClientStrategy;
  configPath?: (home: string) => string;
  configRoot?: "mcpServers" | "mcp";
  nativeAdd?: (serverCommand: string[]) => string[];
  nativeList?: string[];
  nativeRemove?: string[];
}

export interface McpClientStatus {
  name: McpClientName;
  label: string;
  state: McpClientState;
  detail: string;
  definition: McpClientDefinition;
}

export const MCP_CLIENTS: McpClientDefinition[] = [
  {
    name: "claude", label: "Claude Code", command: "claude", strategy: "native",
    nativeAdd: (server) => ["mcp", "add", "--scope", "user", "keepitmovin", "--", ...server],
    nativeList: ["mcp", "list"], nativeRemove: ["mcp", "remove", "--scope", "user", "keepitmovin"]
  },
  {
    name: "codex", label: "Codex", command: "codex", strategy: "native",
    nativeAdd: (server) => ["mcp", "add", "keepitmovin", "--", ...server],
    nativeList: ["mcp", "list"], nativeRemove: ["mcp", "remove", "keepitmovin"]
  },
  {
    name: "cursor", label: "Cursor", strategy: "json",
    configPath: (home) => path.join(home, ".cursor", "mcp.json"), configRoot: "mcpServers"
  },
  {
    name: "kimi", label: "Kimi Code", command: "kimi", strategy: "native",
    nativeAdd: (server) => ["mcp", "add", "--transport", "stdio", "keepitmovin", "--", ...server],
    nativeList: ["mcp", "list"], nativeRemove: ["mcp", "remove", "keepitmovin"]
  },
  {
    name: "antigravity", label: "Google Antigravity", command: "agy", strategy: "json",
    configPath: (home) => path.join(home, ".gemini", "config", "mcp_config.json"),
    configRoot: "mcpServers"
  },
  {
    name: "opencode", label: "OpenCode", command: "opencode", strategy: "json",
    configPath: (home) => path.join(home, ".config", "opencode", "opencode.json"), configRoot: "mcp"
  },
  {
    name: "grok", label: "Grok Build", command: "grok", strategy: "native",
    nativeAdd: (server) => ["mcp", "add", "--scope", "user", "keepitmovin", "--", ...server],
    nativeList: ["mcp", "list"], nativeRemove: ["mcp", "remove", "--scope", "user", "keepitmovin"]
  },
  {
    name: "copilot", label: "GitHub Copilot CLI", command: "copilot", strategy: "native",
    nativeAdd: (server) => ["mcp", "add", "keepitmovin", "--", ...server],
    nativeList: ["mcp", "list"], nativeRemove: ["mcp", "remove", "keepitmovin"]
  },
  {
    name: "ollama", label: "Ollama", command: "ollama", strategy: "unsupported"
  }
];

export type McpCommandRunner = (
  command: string,
  args: string[]
) => Promise<{ exitCode: number; output: string }>;

export const defaultMcpCommandRunner: McpCommandRunner = async (command, args) => {
  try {
    const result = await execa(command, args, {
      reject: false, timeout: 5_000, stdin: "ignore", stdout: "pipe", stderr: "pipe",
      env: { ...process.env, CI: "true" }
    });
    return {
      exitCode: result.exitCode ?? 1,
      output: `${result.stdout}\n${result.stderr}\n${result.shortMessage ?? ""}`.trim()
    };
  } catch (error) {
    const value = error as { exitCode?: number; message?: string };
    return { exitCode: value.exitCode ?? 127, output: value.message ?? String(error) };
  }
};

const readJsonConfig = async (file: string): Promise<Record<string, unknown> | undefined> => {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
};

const directClientAvailable = async (
  client: McpClientDefinition,
  home: string,
  run: McpCommandRunner
): Promise<boolean> => {
  if (client.command) {
    const found = await run(client.command, ["--version"]);
    if (found.exitCode !== 127 && !found.output.toLowerCase().includes("not found")) return true;
  }
  if (client.name === "cursor") {
    try {
      await access(path.join(home, ".cursor"));
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

export const getMcpClientStatuses = async (options: {
  homeDir?: string;
  runCommand?: McpCommandRunner;
} = {}): Promise<McpClientStatus[]> => {
  const home = options.homeDir ?? os.homedir();
  const run = options.runCommand ?? defaultMcpCommandRunner;
  return Promise.all(MCP_CLIENTS.map(async (definition): Promise<McpClientStatus> => {
    if (definition.strategy === "unsupported") {
      return { ...definition, definition, state: "unsupported", detail: "not an MCP client" };
    }

    if (definition.strategy === "json") {
      const available = await directClientAvailable(definition, home, run);
      if (!available) return { ...definition, definition, state: "missing", detail: "client not found" };
      const file = definition.configPath!(home);
      const config = await readJsonConfig(file);
      const root = config?.[definition.configRoot!];
      const installed = root && typeof root === "object" && "keepitmovin" in root;
      return {
        ...definition, definition,
        state: installed ? "installed" : "ready",
        detail: installed ? `configured in ${file}` : `ready to configure ${file}`
      };
    }

    const help = await run(definition.command!, ["mcp", "--help"]);
    const normalized = help.output.toLowerCase();
    if (help.exitCode === 127 || normalized.includes("cannot find github copilot cli")) {
      return { ...definition, definition, state: "missing", detail: "client not found" };
    }
    if (!normalized.includes("mcp") && !normalized.includes("model context protocol")) {
      return {
        ...definition, definition,
        state: definition.name === "kimi" ? "upgrade_required" : "missing",
        detail: definition.name === "kimi" ? "installed Kimi version has no MCP command" : "MCP command unavailable"
      };
    }
    const listed = await run(definition.command!, definition.nativeList!);
    const installed = listed.output.toLowerCase().includes("keepitmovin");
    return {
      ...definition, definition,
      state: installed ? "installed" : "ready",
      detail: installed ? "keepitmovin is configured" : "MCP-capable client found"
    };
  }));
};
