// CI smoke check: start the built `movin mcp` server over stdio, run the MCP
// handshake, and require a resources/list answer. There is no test suite, so
// this is what proves the published MCP entry point actually serves.
import { spawn } from "node:child_process";

const TIMEOUT_MS = 10_000;
const server = spawn(process.execPath, ["dist/cli.js", "mcp"], { stdio: ["pipe", "pipe", "inherit"] });

const fail = (message) => {
  console.error(`MCP smoke failed: ${message}`);
  server.kill();
  process.exit(1);
};

const timer = setTimeout(() => fail(`no resources/list response within ${TIMEOUT_MS}ms`), TIMEOUT_MS);
const send = (message) => server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

let buffered = "";
server.stdout.on("data", (chunk) => {
  buffered += chunk.toString("utf8");
  let newline;
  while ((newline = buffered.indexOf("\n")) !== -1) {
    const line = buffered.slice(0, newline).trim();
    buffered = buffered.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.error) fail(JSON.stringify(message.error));
    if (message.id === 1) {
      send({ method: "notifications/initialized" });
      send({ id: 2, method: "resources/list" });
    } else if (message.id === 2) {
      const names = (message.result?.resources ?? []).map((resource) => resource.uri);
      console.log(`MCP smoke ok: ${names.length} resources (${names.join(", ")})`);
      clearTimeout(timer);
      server.kill();
      process.exit(0);
    }
  }
});

server.on("exit", (code) => fail(`server exited early (code ${code})`));

send({
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "keepitmovin-smoke", version: "0.0.0" }
  }
});
