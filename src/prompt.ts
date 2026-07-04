import type { TaskContext } from "./types.js";

export const buildPrompt = (context: TaskContext): string => [
  "You are running as part of an agent fallback chain.",
  "",
  "User task:",
  context.task,
  "",
  "Working directory:",
  context.cwd,
  "",
  "Repository context:",
  context.repoContext,
  "",
  "Project instructions:",
  context.projectInstructions,
  "",
  "Previous provider attempt:",
  context.previousAttemptSummary,
  "",
  "Rules:",
  "- Make the smallest safe change that completes the task.",
  "- Prefer existing project conventions.",
  "- Run relevant checks if available.",
  "- Do not delete unrelated files.",
  "- Never push changes.",
  "- Do not create commits unless the user explicitly asked for a commit in this task.",
  "- At the end, summarize changed files and commands run."
].join("\n");
