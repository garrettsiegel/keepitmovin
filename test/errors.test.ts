import { describe, expect, it } from "vitest";
import { classifyError, isUsageWarning, matchProviderLimitPattern } from "../src/errors.js";

describe("isUsageWarning", () => {
  it("flags the exact 92% session-limit warning", () => {
    expect(
      isUsageWarning(
        "You've used 92% of your session limit · resets 1am (America/New_York) · /upgrade to keep using Claude Code"
      )
    ).toBe(true);
  });

  it("flags an explicit 'approaching your limit' notice", () => {
    expect(isUsageWarning("You are approaching your usage limit")).toBe(true);
  });

  it("does not flag a real limit-hit banner", () => {
    expect(isUsageWarning("usage limit reached")).toBe(false);
  });

  it("does not flag 100% usage (that is exhaustion, not a warning)", () => {
    expect(isUsageWarning("You've used 100% of your session limit")).toBe(false);
  });

  it("does not flag an unrelated percentage without limit context", () => {
    expect(isUsageWarning("Coverage rose to 92% across the suite")).toBe(false);
  });
});

describe("classifyError", () => {
  it("detects rate limits", () => {
    expect(classifyError("", "429 too many requests; rate limit reached", 1)).toBe("rate_limit");
  });

  it("treats a percentage usage warning at exit as a plain nonzero exit", () => {
    expect(
      classifyError(
        "You've used 92% of your session limit · resets 1am (America/New_York) · /upgrade to keep using Claude Code",
        "",
        1
      )
    ).toBe("nonzero_exit");
  });

  it("detects quota failures", () => {
    expect(classifyError("", "insufficient quota", 1)).toBe("quota_exceeded");
  });

  it("detects auth failures", () => {
    expect(classifyError("", "login required", 1)).toBe("auth_error");
    expect(classifyError("", "not authenticated", 1)).toBe("auth_error");
  });

  it("still classifies imperative auth banners on a non-zero exit", () => {
    // "please log in" is restricted to the exit path (kept out of live detection
    // to avoid prose false-positives) but must still classify a failed exit.
    expect(classifyError("", "Please log in to continue", 1)).toBe("auth_error");
    expect(classifyError("", "sign in required", 1)).toBe("auth_error");
  });

  it("does not treat ordinary FS permission errors as auth failures", () => {
    expect(classifyError("", "Error: permission denied: open '.env'", 1)).toBe("nonzero_exit");
  });

  it("detects timeouts", () => {
    expect(classifyError("", "", null, { timedOut: true })).toBe("timeout");
  });

  it("detects missing commands", () => {
    expect(classifyError("", "", null, { commandNotFound: true })).toBe("command_not_found");
  });

  it("detects generic nonzero exits", () => {
    expect(classifyError("", "something failed", 2)).toBe("nonzero_exit");
  });

  it("returns undefined for success", () => {
    expect(classifyError("ok", "", 0)).toBeUndefined();
  });
});

describe("matchProviderLimitPattern", () => {
  it("matches a provider banner case-insensitively", () => {
    expect(matchProviderLimitPattern("You are OUT of Credits now", ["you are out of credits"]))
      .toBe("you are out of credits");
  });

  it("returns undefined when no banner is present", () => {
    expect(matchProviderLimitPattern("all good here", ["you are out of credits"])).toBeUndefined();
  });

  it("returns undefined when the provider has no patterns", () => {
    expect(matchProviderLimitPattern("you are out of credits", undefined)).toBeUndefined();
    expect(matchProviderLimitPattern("you are out of credits", [])).toBeUndefined();
  });
});
