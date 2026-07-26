import { describe, expect, it } from "vitest";
import { chooseSwitchProvider } from "../src/harness/switch-menu.js";
import type { InteractiveProviderConfig } from "../src/config/types.js";

const makeProvider = (name: string): InteractiveProviderConfig => ({
  name,
  label: name,
  enabled: true,
  command: name,
  args: [],
  handoffArgs: [],
  integrationType: "pty"
});

describe("chooseSwitchProvider", () => {
  it("returns undefined with no candidates", async () => {
    const result = await chooseSwitchProvider([], "rate_limit");
    expect(result).toBeUndefined();
  });

  it("auto-selects the only remaining candidate without prompting", async () => {
    const choice = { provider: makeProvider("codex"), index: 1 };
    const result = await chooseSwitchProvider([choice], "rate_limit");
    expect(result).toBe(choice);
  });
});
