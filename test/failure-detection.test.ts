import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { detectLiveFailure } from "../src/failure-detection.js";
import { getProviderCatalog } from "../src/provider-catalog.js";
import type { InteractiveProviderConfig } from "../src/types.js";

const makeProvider = (
  overrides: Partial<InteractiveProviderConfig> = {}
): InteractiveProviderConfig => ({
  name: "claude",
  label: "Claude Code",
  enabled: true,
  command: "claude",
  args: [],
  handoffArgs: [],
  integrationType: "pty",
  ...overrides
});

describe("detectLiveFailure — provider limitPatterns", () => {
  const config = defaultConfig();

  // Every catalog banner should still trip a switch when it heads its own line.
  const catalogBanners = getProviderCatalog()
    .flatMap((entry) => (entry.limitPatterns ?? []).map((pattern) => [entry.name, pattern] as const));

  it.each(catalogBanners)(
    "detects the %s banner %j on its own line",
    (_name, banner) => {
      const provider = makeProvider({ limitPatterns: [banner] });
      const result = detectLiveFailure(`working...\n${banner}\n`, provider, config, []);
      expect(result).toBe("rate_limit");
    }
  );

  it("does not switch when a banner is quoted inside an agent's prose", () => {
    // "you are out of credits" carries no generic pattern or status word, so only
    // the provider-banner path could match it — and it shouldn't, mid-prose.
    const provider = makeProvider({ limitPatterns: ["you are out of credits"] });
    const line =
      "Let me check whether the message you are out of credits shows up anywhere.";
    expect(detectLiveFailure(`${line}\n`, provider, config, [])).toBeUndefined();
  });

  it("does not switch when a banner appears inside a code block", () => {
    const provider = makeProvider({ limitPatterns: ["you are out of credits"] });
    const transcript = [
      "```",
      "  console.log('you are out of credits');",
      "```"
    ].join("\n");
    expect(detectLiveFailure(transcript, provider, config, [])).toBeUndefined();
  });

  it("still switches on a banner prefixed by an error indicator", () => {
    const provider = makeProvider({ limitPatterns: ["you are out of credits"] });
    expect(
      detectLiveFailure("Error: you are out of credits\n", provider, config, [])
    ).toBe("rate_limit");
  });

  it("does not switch when rate_limit is not a fallback trigger", () => {
    const provider = makeProvider({
      limitPatterns: ["you are out of credits"],
      fallbackOn: ["auth_error"]
    });
    expect(
      detectLiveFailure("you are out of credits\n", provider, config, [])
    ).toBeUndefined();
  });
});

describe("detectLiveFailure — generic patterns keep the prose guard", () => {
  const config = defaultConfig();
  const provider = makeProvider();

  it("switches on a status-like rate-limit line", () => {
    expect(
      detectLiveFailure("Error: rate limit exceeded\n", provider, config, [])
    ).toBe("rate_limit");
  });

  it("ignores a rate-limit mention in ordinary prose", () => {
    expect(
      detectLiveFailure(
        "I'll add handling for the API rate limit so we stay under 429s.\n",
        provider,
        config,
        []
      )
    ).toBeUndefined();
  });

  it("does not switch on ordinary permission denied tool noise", () => {
    expect(
      detectLiveFailure("Error: permission denied: open '.env'\n", provider, config, [])
    ).toBeUndefined();
  });

  it("does not switch when the agent's own prose leads with 'Please log in'", () => {
    // Imperative auth advice heads the line, which the prose guard's startsWith
    // branch would otherwise treat as a status line — it must not force a switch.
    expect(
      detectLiveFailure(
        "Please log in to the gh CLI and re-run the deploy step.\n",
        provider,
        config,
        []
      )
    ).toBeUndefined();
  });

  it("does not switch when a TUI wraps prose so 'please log in' heads a row", () => {
    expect(
      detectLiveFailure(
        "First you'll want to\nplease log in to the Supabase dashboard and create a project.\n",
        provider,
        config,
        []
      )
    ).toBeUndefined();
  });
});

describe("detectLiveFailure — percentage usage warnings are not limits", () => {
  const config = defaultConfig();
  const provider = makeProvider();

  it("ignores the exact 92% session-limit warning on one line", () => {
    const warning =
      "You've used 92% of your session limit · resets 1am (America/New_York) · /upgrade to keep using Claude Code";
    expect(detectLiveFailure(`${warning}\n`, provider, config, [])).toBeUndefined();
  });

  it("ignores the warning when the TUI wraps it across two rows", () => {
    // Regression for the reported bug: ink wraps the row, so "session limit …"
    // heads its own line and would otherwise satisfy the prose guard.
    const wrapped = [
      "You've used 92% of your",
      "session limit · resets 1am (America/New_York) · /upgrade to keep using Claude Code"
    ].join("\n");
    expect(detectLiveFailure(`${wrapped}\n`, provider, config, [])).toBeUndefined();
  });

  it("ignores the wrapped weekly usage-limit warning the same way", () => {
    const wrapped = [
      "You've used 92% of your",
      "usage limit · resets Monday · /upgrade to keep using Claude Code"
    ].join("\n");
    expect(detectLiveFailure(`${wrapped}\n`, provider, config, [])).toBeUndefined();
  });

  it("still switches on a genuine exhaustion banner", () => {
    expect(
      detectLiveFailure("Claude usage limit reached.\n", provider, config, [])
    ).toBe("rate_limit");
  });

  it("still switches when a real banner follows a warning later in the tail", () => {
    const tail = [
      "You've used 92% of your session limit · resets 1am",
      "Working on the task...",
      "Claude usage limit reached."
    ].join("\n");
    expect(detectLiveFailure(`${tail}\n`, provider, config, [])).toBe("rate_limit");
  });
});
