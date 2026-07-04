import type { AgentErrorType, CodePassConfig } from "./types.js";
import { loadProjectInstructions } from "./context.js";
import { formatGitContext, getGitContext } from "./git.js";

export interface BuildHandoffOptions {
  cwd: string;
  config: CodePassConfig;
  fromProvider: string;
  toProvider: string;
  errorType?: AgentErrorType;
  transcriptExcerpt: string;
}

export const buildHandoffPrompt = async (
  options: BuildHandoffOptions
): Promise<string> => {
  const gitContext = await getGitContext(
    options.cwd,
    options.config.context.maxDiffChars
  );
  const instructions = options.config.context.includeProjectInstructions
    ? await loadProjectInstructions(options.cwd, options.config.context.instructionFiles)
    : "";

  return [
    "You are continuing work from another coding agent inside CodePass.",
    "",
    `Previous provider: ${options.fromProvider}`,
    `New provider: ${options.toProvider}`,
    `Reason for handoff: ${options.errorType ?? "unknown"}`,
    "",
    "Important limitation:",
    "CodePass cannot copy the previous provider's private internal conversation. Use the repository context, changed files, and transcript excerpt below to continue practically.",
    "",
    "Repository context:",
    formatGitContext(gitContext),
    "",
    "Project instructions:",
    instructions || "No project instruction files found.",
    "",
    "Recent terminal transcript excerpt:",
    options.transcriptExcerpt || "(no transcript captured)",
    "",
    "Continue the user's coding session from this state. Prefer small, safe steps; inspect the repo before editing; and summarize what you changed."
  ].join("\n");
};
