import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { readMcpHandoff } from "../src/mcp/data.js";
import { createKeepitmovinMcpServer } from "../src/mcp/server.js";
import { writeSessionLog } from "../src/util/session-log.js";
import { makeTempDir } from "./support/tmp.js";

const project = async (): Promise<string> => {
  const cwd = await makeTempDir("kim-mcp-server");
  await mkdir(path.join(cwd, ".keepitmovin", "current"), { recursive: true });
  await writeFile(
    path.join(cwd, ".keepitmovin", "current", "handoff.md"),
    "# Handoff\n\nGoal: continue\n\nAPI_KEY=sk-ant-api03-AbCdEf0123456789ghIJKlMnOp\n",
    "utf8"
  );
  await writeSessionLog(cwd, defaultConfig(), {
    cwd,
    startedAt: "2026-07-19T00:00:00.000Z",
    endedAt: "2026-07-19T00:01:00.000Z",
    providerOrder: ["claude", "codex"],
    attempts: [{
      provider: "codex", label: "Codex", command: "codex", args: [],
      startedAt: "2026-07-19T00:00:00.000Z", endedAt: "2026-07-19T00:01:00.000Z",
      exitCode: 0, transcriptExcerpt: "private transcript",
      handoffReceipt: { status: "received", restatedGoal: "continue", nextAction: "test" }
    }],
    finalProvider: "codex", success: true, changedFiles: ["src/app.ts"]
  });
  return cwd;
};

describe("read-only MCP server", () => {
  it("exposes sanitized handoff and summary resources plus read-only tools", async () => {
    const cwd = await project();
    const server = createKeepitmovinMcpServer({ cwd, version: "test" });
    const client = new Client({ name: "test", version: "1" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toEqual([
      "keepitmovin://current/handoff",
      "keepitmovin://sessions/recent"
    ]);
    const handoff = await client.readResource({ uri: "keepitmovin://current/handoff" });
    expect(JSON.stringify(handoff)).toContain("Goal: continue");
    expect(JSON.stringify(handoff)).not.toContain("sk-ant-api03-AbCdEf0123456789ghIJKlMnOp");
    const sessions = await client.readResource({ uri: "keepitmovin://sessions/recent" });
    expect(JSON.stringify(sessions)).toContain("compactionsRecovered");
    expect(JSON.stringify(sessions)).not.toContain("private transcript");

    const tools = await client.listTools();
    expect(tools.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "get_current_handoff", annotations: expect.objectContaining({ readOnlyHint: true }) }),
      expect.objectContaining({ name: "list_recent_sessions", annotations: expect.objectContaining({ readOnlyHint: true }) })
    ]));
    const result = await client.callTool({ name: "list_recent_sessions", arguments: {} });
    expect(JSON.stringify(result)).toContain("codex");

    await client.close();
    await server.close();
  });
});

describe("MCP path containment", () => {
  it("refuses a handoff path that escapes the project root via a symlink", async () => {
    // A lexical resolve alone reports this as inside the root, so without
    // realpath resolution the target file would be streamed to any MCP client.
    const root = await makeTempDir("kim-mcp-symlink");
    const outside = await makeTempDir("kim-mcp-outside");
    await mkdir(path.join(root, ".keepitmovin"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "handoff.md"), "SECRET", "utf8");
    await symlink(outside, path.join(root, ".keepitmovin", "current"), "dir");

    await writeFile(
      path.join(root, "keepitmovin.config.json"),
      JSON.stringify({ harness: { handoffPath: ".keepitmovin/current/handoff.md" } }),
      "utf8"
    );

    await expect(readMcpHandoff(root)).rejects.toThrow(/outside the active MCP project root/);
  });

  it("still allows a real path inside the project root", async () => {
    const root = await makeTempDir("kim-mcp-ok");
    await mkdir(path.join(root, ".keepitmovin", "current"), { recursive: true });
    await writeFile(path.join(root, ".keepitmovin", "current", "handoff.md"), "# Handoff", "utf8");

    await expect(readMcpHandoff(root)).resolves.toContain("# Handoff");
  });
});
