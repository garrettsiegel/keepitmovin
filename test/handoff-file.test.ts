import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  appendHandoffCheckpoint,
  archiveHandoffFile,
  buildProviderHandoffPrompt,
  buildSessionPrompt,
  clearHandoffArtifacts,
  createHandoffFile,
  getHandoffPaths,
  summarizeHandoffFile
} from "../src/handoff-file.js";

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-handoff-file-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

describe("handoff file helpers", () => {
  it("creates, appends, summarizes, archives, and clears handoff files", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const providers = config.harness.providers.filter((provider) => provider.name !== "cline");
    const livePath = await createHandoffFile(cwd, config, providers, "2026-07-03T17:00:00.000Z");

    expect(livePath).toBe(getHandoffPaths(cwd, config).livePath);
    await appendHandoffCheckpoint(cwd, config, {
      type: "tool_switch",
      fromProvider: "Claude Code",
      toProvider: "Codex",
      reason: "rate_limit",
      transcriptExcerpt: "rate limit reached"
    });

    const content = await readFile(livePath, "utf8");
    expect(content).toContain("CodePass Handoff");
    expect(content).toContain("Reason: rate_limit");
    expect(content).toContain("rate limit reached");

    const summary = await summarizeHandoffFile(cwd, config);
    expect(summary.exists).toBe(true);
    expect(summary.summary).toContain("CodePass Handoff");

    const archivePath = await archiveHandoffFile(cwd, config, "session-1");
    expect(archivePath).toBeDefined();
    await expect(stat(archivePath ?? "")).resolves.toBeDefined();

    await mkdir(path.join(cwd, ".codepass", "sessions"), { recursive: true });
    await writeFile(path.join(cwd, ".codepass", "sessions", "fake.json"), "{}", "utf8");
    const removed = await clearHandoffArtifacts(cwd, config);
    expect(removed.length).toBeGreaterThan(0);
    await expect(stat(livePath)).rejects.toThrow();
  });

  it("builds session and provider handoff prompts with the handoff path", () => {
    const config = defaultConfig();
    const providers = config.harness.providers.filter((provider) => provider.name !== "cline");
    const sessionPrompt = buildSessionPrompt("/repo/.codepass/current/handoff.md", providers);
    const providerPrompt = buildProviderHandoffPrompt(
      "/repo/.codepass/current/handoff.md",
      "Claude Code",
      "Codex",
      "rate_limit"
    );

    expect(sessionPrompt).toContain("Keep this shared handoff file updated");
    expect(sessionPrompt).toContain("/repo/.codepass/current/handoff.md");
    expect(providerPrompt).toContain("Read this handoff file first");
    expect(providerPrompt).toContain("Switch reason: rate_limit");
  });
});
