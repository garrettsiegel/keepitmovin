import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { isRoutingRequested, resolveRouteForLaunch } from "../src/routing/launch.js";
import { makeTempDir } from "./support/tmp.js";


describe("launch routing", () => {
  it("keeps automatic routing opt-in but honors explicit one-run overrides", () => {
    const config = defaultConfig();

    expect(isRoutingRequested({ task: "Implement the plan" }, config, "Implement the plan")).toBe(false);
    expect(isRoutingRequested({ task: "Implement the plan", tier: "deep" }, config, "Implement the plan")).toBe(true);
    expect(isRoutingRequested({ task: "Implement the plan", model: "gpt-5.6-sol" }, config, "Implement the plan")).toBe(true);
    expect(isRoutingRequested({ task: "Implement the plan", tier: "deep", route: false }, config, "Implement the plan")).toBe(false);
  });

  it("classifies task arguments and applies a CLI tier override", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const task = "Rename the old config key";

    const automatic = await resolveRouteForLaunch({ task }, { ...config, routing: { ...config.routing, enabled: true } }, cwd, task);
    const overridden = await resolveRouteForLaunch({ task, tier: "deep" }, config, cwd, task);

    expect(automatic).toMatchObject({ tier: "light", source: "classifier" });
    expect(overridden).toMatchObject({ tier: "deep", source: "tier_override" });
  });

  it("records explicit model and effort selection as an override", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    const task = "Implement the plan";

    await expect(resolveRouteForLaunch({ task, effort: "xhigh" }, config, cwd, task))
      .resolves.toMatchObject({ tier: "standard", source: "model_override" });
  });
});
