import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readMcpHandoff, readMcpSessionSummaries } from "./data.js";

const HANDOFF_URI = "keepitmovin://current/handoff";
const SESSIONS_URI = "keepitmovin://sessions/recent";

const resolveProjectRoot = async (server: McpServer, fallback: string): Promise<string> => {
  if (server.server.getClientCapabilities()?.roots) {
    try {
      const result = await server.server.listRoots();
      const fileRoot = result.roots.find((root) => root.uri.startsWith("file:"));
      if (fileRoot) return fileURLToPath(fileRoot.uri);
    } catch {
      // Older clients may advertise roots but fail the request. Use their cwd.
    }
  }
  return fallback;
};

export const createKeepitmovinMcpServer = (options: {
  cwd?: string;
  version: string;
}): McpServer => {
  const server = new McpServer({ name: "keepitmovin", version: options.version });
  const root = (): Promise<string> => resolveProjectRoot(server, options.cwd ?? process.cwd());

  server.registerResource("current-handoff", HANDOFF_URI, {
    title: "Current keepitmovin handoff",
    description: "The active project's sanitized continuity handoff.",
    mimeType: "text/markdown"
  }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readMcpHandoff(await root()) }]
  }));

  server.registerResource("recent-sessions", SESSIONS_URI, {
    title: "Recent keepitmovin sessions",
    description: "Up to ten sanitized session outcomes, without transcript excerpts.",
    mimeType: "application/json"
  }, async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(await readMcpSessionSummaries(await root()), null, 2)
    }]
  }));

  server.registerTool("get_current_handoff", {
    description: "Read the active project's sanitized keepitmovin handoff.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async () => ({ content: [{ type: "text", text: await readMcpHandoff(await root()) }] }));

  server.registerTool("list_recent_sessions", {
    description: "List recent sanitized keepitmovin session outcomes without transcripts.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async () => ({
    content: [{ type: "text", text: JSON.stringify(await readMcpSessionSummaries(await root()), null, 2) }]
  }));

  return server;
};

export const serveKeepitmovinMcp = async (options: {
  cwd?: string;
  version: string;
}): Promise<void> => {
  const server = createKeepitmovinMcpServer(options);
  await server.connect(new StdioServerTransport());
};
