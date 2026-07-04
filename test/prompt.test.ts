import { describe, expect, it } from "vitest";
import { buildPrompt } from "../src/prompt.js";

describe("buildPrompt", () => {
  it("includes the task, repository context, instructions, and prior attempts", () => {
    const prompt = buildPrompt({
      task: "fix the failing tests",
      cwd: "/tmp/project",
      repoContext: "git status --short:\n M src/index.ts",
      projectInstructions: "Use TypeScript.",
      previousAttemptSummary: "Provider: claude\nError type: rate_limit"
    });

    expect(prompt).toContain("fix the failing tests");
    expect(prompt).toContain("git status --short");
    expect(prompt).toContain("Use TypeScript.");
    expect(prompt).toContain("Provider: claude");
    expect(prompt).toContain("Never push changes.");
  });
});
