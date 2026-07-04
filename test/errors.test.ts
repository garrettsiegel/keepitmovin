import { describe, expect, it } from "vitest";
import { classifyError } from "../src/errors.js";

describe("classifyError", () => {
  it("detects rate limits", () => {
    expect(classifyError("", "429 too many requests; rate limit reached", 1)).toBe("rate_limit");
  });

  it("detects quota failures", () => {
    expect(classifyError("", "insufficient quota", 1)).toBe("quota_exceeded");
  });

  it("detects auth failures", () => {
    expect(classifyError("", "login required", 1)).toBe("auth_error");
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
