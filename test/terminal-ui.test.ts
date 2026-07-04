import { describe, expect, it } from "vitest";
import stripAnsi from "strip-ansi";
import { renderToolCheck } from "../src/terminal-ui.js";

describe("terminal UI", () => {
  it("groups provider checks into friendly setup sections", () => {
    const output = stripAnsi(renderToolCheck([
      {
        name: "claude",
        label: "Claude Code",
        command: "claude",
        available: true,
        detail: "2.1.199",
        guidance: "Run `claude auth` if needed.",
        group: "harness",
        integrationType: "pty",
        controllable: true,
        summary: "Terminal-native coding agent."
      },
      {
        name: "aider",
        label: "Aider",
        command: "aider",
        available: false,
        detail: "not installed yet",
        guidance: "Install Aider when you want to add it.",
        group: "harness",
        integrationType: "pty_with_bootstrap_input",
        controllable: true,
        summary: "Terminal pair-programming agent."
      },
      {
        name: "devin",
        label: "Devin",
        command: "setup guide",
        available: false,
        detail: "guided integration",
        guidance: "CodePass cannot live-switch into Devin yet.",
        group: "guided",
        integrationType: "cloud_link",
        controllable: false,
        summary: "Cloud software-engineering agent."
      }
    ]));

    expect(output).toContain("Ready now");
    expect(output).toContain("Install to use");
    expect(output).toContain("Popular IDE/cloud tools");
    expect(output).toContain("ADD LATER");
    expect(output).toContain("CLOUD");
    expect(output).not.toContain("command not found");
  });
});
