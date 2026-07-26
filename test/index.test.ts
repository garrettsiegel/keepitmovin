import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

// index.ts is the published barrel and had no test and no internal consumer, so a
// removed or renamed export only surfaced at build time. Pinning the surface makes
// an accidental removal a failing test rather than a silent breaking change.
describe("public export surface", () => {
  it("exports the documented entry points", () => {
    for (const name of [
      "runHarness",
      "loadConfig",
      "defaultConfig",
      "keepitmovinConfigSchema",
      "classifyError",
      "detectLiveFailure",
      "getProviderCatalog",
      "redactSecrets",
      "isSafeToRecursivelyDelete",
      "assessHandoffQuality"
    ]) {
      expect(api, `missing export: ${name}`).toHaveProperty(name);
    }
  });

  it("exports only defined values", () => {
    const undefinedExports = Object.entries(api)
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    expect(undefinedExports).toEqual([]);
  });
});
