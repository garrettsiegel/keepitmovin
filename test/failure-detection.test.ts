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

describe("detectLiveFailure — newly supported tools (Phase 1)", () => {
  const config = defaultConfig();
  const forTool = (name: string): InteractiveProviderConfig => {
    const entry = getProviderCatalog().find((candidate) => candidate.name === name);
    if (!entry) throw new Error(`no catalog entry for ${name}`);
    return makeProvider({ name, label: entry.label, limitPatterns: entry.limitPatterns });
  };

  // [tool, real banner line → switch, prose mention → no switch]
  const cases: Array<[string, string, string]> = [
    [
      "kimi",
      "Error: [provider.rate_limit] 429 too many requests",
      "The wrapper prints [provider.rate_limit] when a 429 happens, I'll handle it."
    ],
    [
      "antigravity",
      "⚠ Individual quota reached. Contact your administrator to enable overages. Resets in 3h38m47s.",
      "The docs describe an individual quota reached state we should handle gracefully."
    ],
    [
      "opencode",
      "Provider is overloaded [retrying in 15s attempt #5]",
      "Let me note the provider is overloaded sometimes and add exponential backoff."
    ],
    [
      "grok",
      "Retry failed: You hit your weekly limit.",
      "Remember you hit your weekly limit yesterday so plan the work accordingly."
    ],
    [
      "cursor",
      "Error: You've hit your usage limit",
      'The cursor note "your usage limits will reset when your monthly cycle ends" is informational.'
    ],
    [
      "copilot",
      '✘ Model call failed: {"message":"You have no quota","code":"quota_exceeded"}',
      "The 402 branch reports you have no quota remaining, which is expected in this test."
    ]
  ];

  it.each(cases)("%s: switches on its real limit banner", (name, banner) => {
    expect(detectLiveFailure(`working...\n${banner}\n`, forTool(name), config, [])).toBe(
      "rate_limit"
    );
  });

  it.each(cases)("%s: does not switch when the banner is only discussed in prose", (name, _banner, prose) => {
    expect(detectLiveFailure(`${prose}\n`, forTool(name), config, [])).toBeUndefined();
  });

  it("copilot: ignores a percentage usage warning", () => {
    const warning = "You've used 85% of your monthly Copilot allowance for premium requests.";
    expect(detectLiveFailure(`${warning}\n`, forTool("copilot"), config, [])).toBeUndefined();
  });

  it("kimi: switches on the legacy Python 'LLM provider error:' wrapper line", () => {
    const line =
      "LLM provider error: Error code: 429 - {'error': {'message': 'The engine is currently overloaded, please try again later', 'type': 'engine_overloaded_error'}}";
    expect(detectLiveFailure(`${line}\n`, forTool("kimi"), config, [])).toBe("rate_limit");
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

describe("detectLiveFailure — 'at capacity' alerts", () => {
  const config = defaultConfig();

  it("switches on the real Claude Code capacity banner", () => {
    // The leading ⚠ is an error indicator, so the strict provider-banner guard
    // trusts this line even though the banner sits mid-line after the glyph.
    const provider = makeProvider();
    const banner = "⚠ Selected model is at capacity. Please try a different model.";
    expect(detectLiveFailure(`working...\n${banner}\n`, provider, config, [])).toBe(
      "rate_limit"
    );
  });

  it("does not switch when an agent merely discusses capacity in prose", () => {
    const provider = makeProvider();
    const line =
      "The docs say the selected model is at capacity sometimes, so I'll add a retry.";
    expect(detectLiveFailure(`${line}\n`, provider, config, [])).toBeUndefined();
  });

  it.each([
    "Error: model is at capacity, please retry later",
    "Error: our servers are over capacity right now",
    "Error: the API is running at full capacity"
  ])("switches on another tool's capacity wording %j via the generic path", (line) => {
    // A provider with no curated limitPatterns still catches capacity wording
    // through the generic RATE_LIMIT family, guarded by the error indicator.
    const provider = makeProvider({
      name: "opencode",
      label: "opencode",
      limitPatterns: undefined
    });
    expect(detectLiveFailure(`${line}\n`, provider, config, [])).toBe("rate_limit");
  });

  it("does not switch on a plain-prose capacity mention with no status shape", () => {
    const provider = makeProvider({
      name: "opencode",
      label: "opencode",
      limitPatterns: undefined
    });
    expect(
      detectLiveFailure(
        "I think the cluster runs at capacity during peak hours.\n",
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

  it("switches on a real banner sitting directly under the context-percentage footer", () => {
    // Regression: the previous-line fold treated the footer's "23% … left" as a
    // usage warning and vetoed the NEXT line, silently swallowing a real banner.
    const tail = [
      "Context left until auto-compact: 23%",
      "Claude usage limit reached."
    ].join("\n");
    expect(detectLiveFailure(`${tail}\n`, provider, config, [])).toBe("rate_limit");
  });

  it("switches on a real banner that quotes its own usage percentage", () => {
    expect(
      detectLiveFailure("Error: Rate limit reached - 87% of quota consumed\n", provider, config, [])
    ).toBe("rate_limit");
  });
});

describe("detectLiveFailure — status words must sit beside the pattern", () => {
  const config = defaultConfig();
  const provider = makeProvider();

  // Each of these tripped a mid-session handoff before status words were matched
  // by token adjacency instead of bare substring.
  it.each([
    "if we hit the rate limit we should back off and retry",
    "i detected a 429 handler in the retry code",
    "normalize whitespace before checking the rate limit string",
    "the retry helper triggered twice, so let's cap the rate limit backoff"
  ])("does not switch on agent prose %j", (line) => {
    expect(detectLiveFailure(`${line}\n`, provider, config, [])).toBeUndefined();
  });

  it.each([
    "Claude usage limit reached.",
    "Error: exceeded rate limit for this model"
  ])("still switches on the real status line %j", (line) => {
    expect(detectLiveFailure(`${line}\n`, provider, config, [])).toBe("rate_limit");
  });
});

describe("detectLiveFailure — injected prompts are stripped from CRLF output", () => {
  const config = defaultConfig();
  const provider = makeProvider();

  it("does not switch when the tool echoes a handoff prompt naming the error type", () => {
    // PTY output is CRLF; the prompt keepitmovin injects is LF. Before
    // normalization the prompt was never stripped, and because it embeds the
    // error type verbatim ("rate_limit" is itself a pattern) an echoing tool
    // could force an immediate re-switch off its own argv.
    const prompt = "Continue the task.\nPrevious tool stopped with: rate_limit reached\n";
    const echoed = prompt.replaceAll("\n", "\r\n");
    expect(detectLiveFailure(echoed, provider, config, [prompt])).toBeUndefined();
  });
});
