import { describe, expect, it } from "vitest";
import { classifyTask, overrideTier } from "../src/routing/classify.js";

describe("task routing", () => {
  it.each([
    ["Rename the old config key", "light"],
    ["Implement the approved plan", "standard"],
    ["Investigate the unknown authentication race condition", "deep"],
    ["Work autonomously across the entire codebase until every phase is complete", "max"]
  ] as const)("routes %s to %s", (task, tier) => {
    expect(classifyTask({ task }).tier).toBe(tier);
  });

  it("uses the highest tier in a mixed task", () => {
    const decision = classifyTask({
      task: "1. Fix a typo in the README\n2. Root cause the intermittent payment failure"
    });

    expect(decision.tier).toBe("deep");
    expect(decision.signals).toContain("2 tasks; routed to the highest required tier");
  });

  it("escalates one tier after repeated failures", () => {
    const decision = classifyTask({ task: "Implement the approved plan", repeatedFailures: 2 });

    expect(decision.tier).toBe("deep");
    expect(decision.signals).toContain("escalated after repeated failure");
  });

  it("lets an explicit tier override win", () => {
    const decision = overrideTier(classifyTask({ task: "Fix a typo" }), "max");

    expect(decision).toMatchObject({ tier: "max", source: "tier_override" });
  });

  it("routes an empty input safely", () => {
    expect(classifyTask({ task: "  " }).tier).toBe("standard");
  });
});
