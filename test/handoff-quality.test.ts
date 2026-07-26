import { describe, expect, it } from "vitest";
import { assessHandoffQuality } from "../src/handoff/quality.js";

// This is what tells `kim session` whether the tool actually recorded anything
// useful before it got handed off. A false "narrative updated" would make an
// empty handoff look like a good one.
const handoff = (sections: Record<string, string>): string =>
  Object.entries(sections)
    .map(([heading, body]) => `## ${heading}\n\n${body}\n`)
    .join("\n");

const FRESH = {
  "Current Goal": "- User has not provided a separate session goal yet. Infer the goal from the live conversation and update this section.",
  "Working State": "- Session just started.",
  "Commands And Checks": "- None recorded yet.",
  Blockers: "- None recorded yet.",
  "Next Step": "- Start by understanding the user's request and current repository state."
};

describe("assessHandoffQuality", () => {
  it("scores an untouched template as uninitialized with every placeholder intact", () => {
    const quality = assessHandoffQuality(handoff(FRESH));

    expect(quality.taskInitialized).toBe(false);
    expect(quality.narrativeUpdated).toBe(false);
    expect(quality.missingSections).toEqual([]);
    expect(quality.placeholdersRemaining).toEqual(
      expect.arrayContaining(["Current Goal", "Working State", "Commands And Checks", "Next Step"])
    );
  });

  it("counts the goal as initialized once the placeholder is replaced", () => {
    const quality = assessHandoffQuality(handoff({ ...FRESH, "Current Goal": "- Fix the checkout flow" }));

    expect(quality.taskInitialized).toBe(true);
    expect(quality.placeholdersRemaining).not.toContain("Current Goal");
    // Replacing only the goal is not a narrative update.
    expect(quality.narrativeUpdated).toBe(false);
  });

  it("counts the narrative as updated when any working section is real", () => {
    const quality = assessHandoffQuality(handoff({
      ...FRESH,
      "Working State": "- Refactored the payment adapter; tests green."
    }));

    expect(quality.narrativeUpdated).toBe(true);
    expect(quality.placeholdersRemaining).not.toContain("Working State");
  });

  it("reports a missing section rather than treating it as filled in", () => {
    const { Blockers: _blockers, ...withoutBlockers } = FRESH;

    expect(assessHandoffQuality(handoff(withoutBlockers)).missingSections).toEqual(["Blockers"]);
  });

  it("treats a heading with an empty body as missing", () => {
    const quality = assessHandoffQuality(handoff({ ...FRESH, Blockers: "" }));

    expect(quality.missingSections).toEqual(["Blockers"]);
  });

  it("reports every section missing for content that is not a handoff at all", () => {
    const quality = assessHandoffQuality("just some text\n");

    expect(quality.missingSections).toHaveLength(5);
    expect(quality.taskInitialized).toBe(false);
    expect(quality.narrativeUpdated).toBe(false);
  });

  it("does not report the same placeholder twice when a section has two variants", () => {
    // "Next Step" has two known placeholder strings; only one can be present,
    // but the dedupe is what keeps the session summary honest either way.
    const quality = assessHandoffQuality(handoff({
      ...FRESH,
      "Next Step": "- Begin the task above and keep this handoff current after each meaningful subtask."
    }));

    expect(quality.placeholdersRemaining.filter((entry) => entry === "Next Step")).toHaveLength(1);
  });
});
