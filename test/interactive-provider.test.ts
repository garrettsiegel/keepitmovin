import { describe, expect, it } from "vitest";
import { renderInteractiveLaunch } from "../src/interactive-provider.js";

describe("renderInteractiveLaunch", () => {
  it("renders first-launch args without a handoff prompt", () => {
    const launch = renderInteractiveLaunch(
      {
        name: "claude",
        label: "Claude Code",
        enabled: true,
        command: "claude",
        args: ["{{sessionPrompt}}", "--add-dir", "{{cwd}}", "{{handoffPath}}"],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      {
        cwd: "/tmp/project",
        handoffPath: "/tmp/project/.codepass/current/handoff.md",
        sessionPrompt: "keep the handoff updated"
      }
    );

    expect(launch).toEqual({
      command: "claude",
      args: [
        "keep the handoff updated",
        "--add-dir",
        "/tmp/project",
        "/tmp/project/.codepass/current/handoff.md"
      ]
    });
  });

  it("renders handoff args when a handoff prompt exists", () => {
    const launch = renderInteractiveLaunch(
      {
        name: "codex",
        label: "Codex",
        enabled: true,
        command: "codex",
        args: [],
        handoffArgs: ["{{handoffPrompt}}"],
        integrationType: "pty"
      },
      { cwd: "/tmp/project", handoffPrompt: "continue from here" }
    );

    expect(launch.args).toEqual(["continue from here"]);
  });

  it("renders bootstrap input for tools that need prompt text typed after launch", () => {
    const launch = renderInteractiveLaunch(
      {
        name: "aider",
        label: "Aider",
        enabled: true,
        command: "aider",
        args: [],
        handoffArgs: [],
        integrationType: "pty_with_bootstrap_input",
        bootstrapInput: "{{sessionPrompt}}\n",
        handoffBootstrapInput: "{{handoffPrompt}}\n"
      },
      {
        cwd: "/tmp/project",
        handoffPrompt: "read the handoff and continue"
      }
    );

    expect(launch).toEqual({
      command: "aider",
      args: [],
      bootstrapInput: "read the handoff and continue\n"
    });
  });
});
