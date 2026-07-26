import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/index.js";
import { isRoutingRequested, resolveRouteForLaunch } from "../src/routing/launch.js";
import { makeTempDir } from "./support/tmp.js";


describe("launch routing", () => {
  it("keeps automatic routing opt-in but honors an explicit --tier", () => {
    const config = defaultConfig();
    const task = "Implement the plan";

    expect(isRoutingRequested({ task }, config, task)).toBe(false);
    expect(isRoutingRequested({ task, tier: "deep" }, config, task)).toBe(true);
    // Routing turned on in config routes without any flag...
    const routingOn = { ...config, routing: { enabled: true } };
    expect(isRoutingRequested({ task }, routingOn, task)).toBe(true);
    // ...but never without a task to classify.
    expect(isRoutingRequested({}, routingOn, undefined)).toBe(false);
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

  it("does not route at all when routing is off and no tier was asked for", async () => {
    const cwd = await makeTempDir();
    const task = "Implement the plan";

    await expect(resolveRouteForLaunch({ task }, defaultConfig(), cwd, task)).resolves.toBeUndefined();
  });
});
