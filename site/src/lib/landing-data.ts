export const handoffSteps = [
  {
    label: "Limit hit",
    title: "A tool hits its limit",
    body: "keepitmovin watches the terminal and recognizes the exact limit message the moment it appears.",
  },
  {
    label: "Context packed",
    title: "Your context is packed",
    body: "The handoff file carries your goal, decisions, and recent changes — refreshed as the tool works.",
  },
  {
    label: "Next tool resumes",
    title: "The next tool resumes",
    body: "It launches with the handoff loaded and picks up where you stopped. You keep typing.",
  },
];

export const comparisonRows = [
  {
    label: "Hit a limit mid-task",
    kim: "The next tool starts automatically, context included.",
    raw: "You copy-paste what you remember into a new session.",
  },
  {
    label: "Context carried over",
    kim: "The handoff file is refreshed as your tools work.",
    raw: "Nothing — the new tool starts blank.",
  },
  {
    label: "Watching for failures",
    kim: "Limits, auth errors, and crashes are detected for you.",
    raw: "You watch the terminal yourself.",
  },
  {
    label: "Multi-tool setup",
    kim: "One setup wizard, zero config to start.",
    raw: "Juggle every CLI's flags and logins by hand.",
  },
];
