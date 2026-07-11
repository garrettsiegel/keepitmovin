import { describe, expect, it } from "vitest";
import { formatCommandEcho, renderInteractiveLaunch } from "../src/interactive-provider.js";

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
        bootstrapInput:
          "Read the CodePass handoff at {{handoffPath}} and continue the session (keep that file updated as you work).\n",
        handoffBootstrapInput:
          "Read the CodePass handoff at {{handoffPath}} first, then continue from where the previous tool left off.\n"
      },
      {
        cwd: "/tmp/project",
        handoffPath: "/tmp/project/.codepass/current/handoff.md",
        handoffPrompt: "read the handoff and continue"
      }
    );

    expect(launch).toEqual({
      command: "aider",
      args: [],
      bootstrapInput:
        "Read the CodePass handoff at /tmp/project/.codepass/current/handoff.md first, then continue from where the previous tool left off.\n"
    });
  });
});

describe("formatCommandEcho", () => {
  it("shows the command alone when there are no args", () => {
    expect(formatCommandEcho("claude", [])).toBe("claude");
  });

  it("shows short args inline", () => {
    expect(formatCommandEcho("opencode", ["/tmp/project", "--prompt", "go"])).toBe(
      "opencode /tmp/project --prompt go"
    );
  });

  it("collapses a long prompt argument to a count marker", () => {
    const longPrompt = "read the handoff file at /tmp/project/.codepass/current/handoff.md and continue the work exactly where the previous tool left off";
    expect(formatCommandEcho("cline", [longPrompt])).toBe("cline [+1 arg]");
  });

  it("pluralizes the marker for multiple long args", () => {
    const filler = "x".repeat(80);
    expect(formatCommandEcho("tool", [filler, filler])).toBe("tool [+2 args]");
  });
});
