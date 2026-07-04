import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildHandoffPrompt } from "../src/handoff.js";

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-handoff-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

describe("buildHandoffPrompt", () => {
  it("includes practical continuity context", async () => {
    const cwd = await makeTempDir();
    await writeFile(path.join(cwd, "AGENTS.md"), "Use careful TypeScript.", "utf8");

    const prompt = await buildHandoffPrompt({
      cwd,
      config: defaultConfig(),
      fromProvider: "Claude Code",
      toProvider: "Codex",
      errorType: "rate_limit",
      transcriptExcerpt: "Claude said rate limit reached."
    });

    expect(prompt).toContain("Previous provider: Claude Code");
    expect(prompt).toContain("New provider: Codex");
    expect(prompt).toContain("Reason for handoff: rate_limit");
    expect(prompt).toContain("Use careful TypeScript.");
    expect(prompt).toContain("Claude said rate limit reached.");
  });
});
