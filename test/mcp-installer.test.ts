import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getMcpClientStatuses, type McpCommandRunner } from "../src/mcp-clients.js";
import { changeMcpInstallations } from "../src/mcp-installer.js";
import { makeTempDir } from "./support/tmp.js";

const tempHome = async (): Promise<string> => {
  const home = await makeTempDir("kim-mcp-home");
  await mkdir(path.join(home, ".cursor"), { recursive: true });
  return home;
};

const directOnlyRunner: McpCommandRunner = async (command, args) => {
  if (command === "agy" || command === "opencode") return { exitCode: 0, output: "1.0.0" };
  if (command === "kimi" && args[0] === "mcp") return { exitCode: 0, output: "Usage: kimi without model context support" };
  return { exitCode: 127, output: "not found" };
};

describe("MCP installer", () => {
  it("reports upgrade-required Kimi and unsupported Ollama honestly", async () => {
    const statuses = await getMcpClientStatuses({ homeDir: await tempHome(), runCommand: directOnlyRunner });
    expect(statuses.find((status) => status.name === "kimi")?.state).toBe("upgrade_required");
    expect(statuses.find((status) => status.name === "ollama")?.state).toBe("unsupported");
  });

  it("installs and removes only the owned entry in direct JSON configs", async () => {
    const home = await tempHome();
    const cursorFile = path.join(home, ".cursor", "mcp.json");
    await writeFile(cursorFile, JSON.stringify({ mcpServers: { existing: { command: "safe" } } }), "utf8");
    const confirm = vi.fn(async () => true);
    const options = {
      homeDir: home,
      entrypoint: "/opt/keepitmovin/dist/cli.js",
      runCommand: directOnlyRunner,
      confirm
    };
    const installed = await changeMcpInstallations("install", options);
    expect(installed.find((result) => result.name === "cursor")?.state).toBe("installed");
    const afterInstall = JSON.parse(await readFile(cursorFile, "utf8")) as {
      mcpServers: Record<string, { command: string; args?: string[] }>;
    };
    expect(afterInstall.mcpServers.existing).toEqual({ command: "safe" });
    expect(afterInstall.mcpServers.keepitmovin?.args).toEqual([
      "/opt/keepitmovin/dist/cli.js", "mcp", "serve"
    ]);

    const removed = await changeMcpInstallations("remove", options);
    expect(removed.find((result) => result.name === "cursor")?.state).toBe("removed");
    const afterRemove = JSON.parse(await readFile(cursorFile, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(afterRemove.mcpServers.existing).toEqual({ command: "safe" });
    expect(afterRemove.mcpServers.keepitmovin).toBeUndefined();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("fails closed on malformed direct config", async () => {
    const home = await tempHome();
    const cursorFile = path.join(home, ".cursor", "mcp.json");
    await writeFile(cursorFile, "{ not json", "utf8");
    const results = await changeMcpInstallations("install", {
      homeDir: home,
      entrypoint: "/opt/keepitmovin/dist/cli.js",
      runCommand: directOnlyRunner,
      confirm: async () => true
    });
    expect(results.find((result) => result.name === "cursor")?.state).toBe("failed");
    expect(await readFile(cursorFile, "utf8")).toBe("{ not json");
  });
});
