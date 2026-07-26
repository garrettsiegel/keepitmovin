import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { redactSecrets } from "./redact.js";
import { readRecentSessionLogs } from "./session-log.js";

export interface McpSessionSummary {
  startedAt: string;
  endedAt: string;
  tools: string[];
  finalProvider?: string;
  success: boolean;
  outcome?: string;
  changedFiles: number;
  handoffReceipts: { received: number; expected: number };
  compactionsRecovered: number;
}

// A purely lexical check is symlink-blind: if `.keepitmovin/current` is a symlink
// to somewhere like ~/.ssh, path.resolve still reports it as inside the root and
// the file would be streamed to any connected MCP client. Compare real paths when
// they exist, and fall back to the lexical check for paths not yet created.
/** Hard cap on how many session summaries an MCP client can pull at once. */
const MAX_MCP_SESSIONS = 10;

const realpathOrSelf = (target: string): string => {
  try {
    return realpathSync.native(target);
  } catch {
    return target;
  }
};

const containedPath = (root: string, candidate: string): string => {
  const resolved = path.resolve(root, candidate);
  const resolvedRoot = realpathOrSelf(path.resolve(root));
  // Check the nearest existing ancestor so a not-yet-created file can't be used
  // to bypass the check via a symlinked parent directory.
  const realCandidate = realpathOrSelf(
    existsSync(resolved) ? resolved : path.dirname(resolved)
  );

  // Compare real paths on both sides — the root itself is often reached through a
  // symlink (on macOS /var -> /private/var), so mixing the two forms would reject
  // perfectly legitimate paths.
  const inside = realCandidate === resolvedRoot || realCandidate.startsWith(`${resolvedRoot}${path.sep}`);

  if (!inside) {
    throw new Error("keepitmovin config points outside the active MCP project root");
  }

  return resolved;
};

export const readMcpHandoff = async (projectRoot: string): Promise<string> => {
  const { config } = await loadConfig(projectRoot);
  const handoffPath = containedPath(projectRoot, config.harness.handoffPath);
  try {
    return redactSecrets(await readFile(handoffPath, "utf8"));
  } catch {
    return "No keepitmovin handoff exists for this project yet.";
  }
};

export const readMcpSessionSummaries = async (
  projectRoot: string,
  limit = MAX_MCP_SESSIONS
): Promise<McpSessionSummary[]> => {
  const { config } = await loadConfig(projectRoot);
  containedPath(projectRoot, config.logs.sessionsDir);
  const logs = await readRecentSessionLogs(
    projectRoot,
    config,
    Math.min(MAX_MCP_SESSIONS, Math.max(0, limit))
  );
  return logs.map((log) => {
    const expected = log.attempts.filter(
      (attempt) => attempt.handoffReceipt?.status !== "not_applicable"
    );
    return {
      startedAt: log.startedAt,
      endedAt: log.endedAt,
      tools: log.attempts.map((attempt) => attempt.provider),
      ...(log.finalProvider ? { finalProvider: log.finalProvider } : {}),
      success: log.success,
      ...(log.outcome ? { outcome: log.outcome } : {}),
      changedFiles: log.changedFiles.length,
      handoffReceipts: {
        received: expected.filter((attempt) => attempt.handoffReceipt?.status === "received").length,
        expected: expected.length
      },
      compactionsRecovered: log.attempts.reduce(
        (count, attempt) => count + (attempt.compactionEvents?.length ?? 0),
        0
      )
    };
  });
};
