import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { makeTempDir } from "./support/tmp.js";
import {
  appendHandoffCheckpoint,
  archiveHandoffFile,
  buildProviderHandoffPrompt,
  buildSessionPrompt,
  clearHandoffArtifacts,
  createHandoffFile,
  getHandoffPaths,
  summarizeHandoffFile
} from "../src/handoff/file.js";


describe("handoff file helpers", () => {
  it("creates, appends, summarizes, archives, and clears handoff files", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const providers = config.harness.providers.filter((provider) => provider.name !== "cline");
    const livePath = await createHandoffFile(
      cwd,
      config,
      providers,
      "2026-07-03T17:00:00.000Z",
      "Fix the checkout flow"
    );

    expect(livePath).toBe(getHandoffPaths(cwd, config).livePath);
    await appendHandoffCheckpoint(cwd, config, {
      type: "tool_switch",
      fromProvider: "Claude Code",
      toProvider: "Codex",
      reason: "rate_limit",
      transcriptExcerpt: "rate limit reached"
    });

    const content = await readFile(livePath, "utf8");
    expect(content).toContain("keepitmovin Handoff");
    expect(content).toContain("- Fix the checkout flow");
    expect(content).toContain("Reason: rate_limit");
    expect(content).toContain("rate limit reached");

    const summary = await summarizeHandoffFile(cwd, config);
    expect(summary.exists).toBe(true);
    expect(summary.summary).toContain("keepitmovin Handoff");

    const archivePath = await archiveHandoffFile(cwd, config, "session-1");
    expect(archivePath).toBeDefined();
    await expect(stat(archivePath ?? "")).resolves.toBeDefined();

    await mkdir(path.join(cwd, ".keepitmovin", "sessions"), { recursive: true });
    await writeFile(path.join(cwd, ".keepitmovin", "sessions", "fake.json"), "{}", "utf8");
    const removed = await clearHandoffArtifacts(cwd, config);
    expect(removed.length).toBeGreaterThan(0);
    await expect(stat(livePath)).rejects.toThrow();
  });

  it("keeps a lean format: one snapshot, no raw diff, trimmed switch history", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const providers = config.harness.providers.filter((provider) => provider.name !== "cline");
    const livePath = await createHandoffFile(cwd, config, providers, "2026-07-05T00:00:00.000Z");

    await appendHandoffCheckpoint(cwd, config, {
      type: "tool_switch",
      fromProvider: "Claude Code",
      toProvider: "Codex",
      reason: "rate_limit",
      transcriptExcerpt: "first excerpt text"
    });
    await appendHandoffCheckpoint(cwd, config, {
      type: "tool_switch",
      fromProvider: "Codex",
      toProvider: "Claude Code",
      reason: "timeout",
      transcriptExcerpt: "second excerpt text"
    });

    const content = await readFile(livePath, "utf8");
    // Exactly one in-place snapshot section, and no embedded raw diff.
    expect(content.match(/## Repository Snapshot/g)).toHaveLength(1);
    expect(content).not.toContain("Recent diff:");
    // Latest transcript excerpt is replaced in place, not appended.
    expect(content).toContain("second excerpt text");
    expect(content).not.toContain("first excerpt text");

    // Switch history trims to the newest SWITCH_HISTORY_LIMIT (10) entries.
    for (let index = 0; index < 12; index += 1) {
      await appendHandoffCheckpoint(cwd, config, {
        type: "tool_switch",
        fromProvider: "Claude Code",
        toProvider: "Codex",
        reason: "rate_limit",
        note: `switch ${index}`
      });
    }
    const afterMany = await readFile(livePath, "utf8");
    const historyBody = afterMany.slice(afterMany.indexOf("## Switch History"));
    const entries = historyBody.split("\n").filter((line) => line.startsWith("- "));
    expect(entries).toHaveLength(10);
    expect(afterMany).not.toContain("Session started");
  });

  it("no-ops when appending a checkpoint with no live handoff file", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    await expect(
      appendHandoffCheckpoint(cwd, config, { type: "tool_switch", fromProvider: "A", toProvider: "B" })
    ).resolves.toBeUndefined();
    await expect(stat(getHandoffPaths(cwd, config).livePath)).rejects.toThrow();
  });

  it("removes only the handoff file when handoffPath resolves to the cwd", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    // A natural-looking but dangerous value: dirname resolves to the cwd itself.
    config.harness.handoffPath = "handoff.md";
    const livePath = getHandoffPaths(cwd, config).livePath;
    await writeFile(livePath, "# handoff", "utf8");
    // User files that must survive a clear, including the extension the unsafe
    // fallback used to scan and delete.
    const userFile = path.join(cwd, "important.txt");
    const userMarkdown = path.join(cwd, "README.md");
    await writeFile(userFile, "keep me", "utf8");
    await writeFile(userMarkdown, "keep me too", "utf8");

    const removed = await clearHandoffArtifacts(cwd, config);

    // The cwd (and the user's file) must still exist; only the handoff file goes.
    await expect(stat(userFile)).resolves.toBeDefined();
    await expect(stat(userMarkdown)).resolves.toBeDefined();
    await expect(stat(cwd)).resolves.toBeDefined();
    await expect(stat(livePath)).rejects.toThrow();
    expect(removed).toContain(cwd);
  });

  it("does not scan an unsafe absolute sessions directory", async () => {
    const cwd = await makeTempDir();
    const unsafeDir = await makeTempDir();
    const config = defaultConfig();
    config.logs.sessionsDir = unsafeDir;
    const unrelatedJson = path.join(unsafeDir, "important.json");
    await writeFile(unrelatedJson, "{}", "utf8");

    await clearHandoffArtifacts(cwd, config);

    await expect(stat(unsafeDir)).resolves.toBeDefined();
    await expect(stat(unrelatedJson)).resolves.toBeDefined();
  });

  it("does not delete an unrelated exact file from an unsafe handoff path", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.harness.handoffPath = "README.md";
    const readme = path.join(cwd, "README.md");
    await writeFile(readme, "user documentation", "utf8");

    await clearHandoffArtifacts(cwd, config);

    await expect(readFile(readme, "utf8")).resolves.toBe("user documentation");
  });

  it("does not overwrite a stale handoff when recovery cannot be written", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const providers = config.harness.providers.slice(0, 1);
    const livePath = await createHandoffFile(
      cwd,
      config,
      providers,
      "2026-07-09T10:00:00.000Z",
      "Preserve this task"
    );
    const blockedRecoveryPath = path.join(
      getHandoffPaths(cwd, config).archiveDir,
      "recovered-2026-07-09T11-00-00-000Z.md"
    );
    await mkdir(blockedRecoveryPath);

    await expect(createHandoffFile(
      cwd,
      config,
      providers,
      "2026-07-09T11:00:00.000Z",
      "Do not write this task"
    )).rejects.toThrow();
    await expect(readFile(livePath, "utf8")).resolves.toContain("Preserve this task");
  });

  it("builds session and provider handoff prompts with the handoff path", () => {
    const config = defaultConfig();
    const providers = config.harness.providers.filter((provider) => provider.name !== "cline");
    const sessionPrompt = buildSessionPrompt("/repo/.keepitmovin/current/handoff.md", providers);
    const providerPrompt = buildProviderHandoffPrompt(
      "/repo/.keepitmovin/current/handoff.md",
      "Claude Code",
      "Codex",
      "rate_limit"
    );

    expect(sessionPrompt).toContain("Keep this shared handoff file updated");
    expect(sessionPrompt).toContain("/repo/.keepitmovin/current/handoff.md");
    expect(providerPrompt).toContain("Read this handoff file first");
    expect(providerPrompt).toContain("Switch reason: rate_limit");
  });
});
