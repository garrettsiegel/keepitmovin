import type { HandoffQuality } from "../config/types.js";

const REQUIRED_SECTIONS = [
  "Current Goal",
  "Working State",
  "Commands And Checks",
  "Blockers",
  "Next Step"
];

const PLACEHOLDERS: Array<[string, string]> = [
  ["Current Goal", "User has not provided a separate session goal yet"],
  ["Working State", "Session just started."],
  ["Commands And Checks", "None recorded yet."],
  ["Next Step", "Start by understanding the user's request and current repository state."],
  ["Next Step", "Begin the task above and keep this handoff current after each meaningful subtask."]
];

const sectionBody = (content: string, heading: string): string => {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) {
    return "";
  }
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, next < 0 ? undefined : next).join("\n").trim();
};

export const assessHandoffQuality = (content: string): HandoffQuality => {
  const missingSections = REQUIRED_SECTIONS.filter((heading) => !sectionBody(content, heading));
  const placeholdersRemaining = PLACEHOLDERS
    .filter(([heading, placeholder]) => sectionBody(content, heading).includes(placeholder))
    .map(([heading]) => heading);
  const taskInitialized = !placeholdersRemaining.includes("Current Goal") &&
    Boolean(sectionBody(content, "Current Goal"));
  const narrativeUpdated = ["Working State", "Commands And Checks", "Next Step"]
    .some((heading) => !placeholdersRemaining.includes(heading) && Boolean(sectionBody(content, heading)));

  return {
    taskInitialized,
    narrativeUpdated,
    missingSections,
    placeholdersRemaining: [...new Set(placeholdersRemaining)]
  };
};
