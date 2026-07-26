import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  applyRouteToLaunch,
  readCodexModels,
  resolveProviderRoute
} from "../src/model-routing.js";
import { classifyTask } from "../src/routing.js";
import { makeTempDir } from "./support/tmp.js";

const makeCodexHome = async (
  models: Array<{ slug: string; efforts: string[] }>
): Promise<string> => {
  const dir = await makeTempDir("kim-models");
  await writeFile(path.join(dir, "models_cache.json"), JSON.stringify({
    models: models.map((model) => ({
      slug: model.slug,
      supported_reasoning_levels: model.efforts.map((effort) => ({ effort }))
    }))
  }), "utf8");
  return dir;
};

const provider = (name: "codex" | "claude") => {
  const match = defaultConfig().harness.providers.find((candidate) => candidate.name === name);
  if (!match) {
    throw new Error(`Missing ${name} test provider`);
  }
  return match;
};

describe("model routing", () => {
  it("reads the local Codex model cache fail-soft", async () => {
    const codexHome = await makeCodexHome([
      { slug: "gpt-5.6-terra", efforts: ["low", "medium"] }
    ]);

    await expect(readCodexModels(codexHome)).resolves.toEqual([
      { slug: "gpt-5.6-terra", supportedReasoning: ["low", "medium"] }
    ]);
    await expect(readCodexModels(path.join(codexHome, "missing"))).resolves.toEqual([]);
  });

  it("prefers the discovered GPT-5.6 model for each tier", async () => {
    const codexHome = await makeCodexHome([
      { slug: "gpt-5.6-luna", efforts: ["low", "medium", "high", "xhigh", "max"] },
      { slug: "gpt-5.6-terra", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
      { slug: "gpt-5.6-sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] }
    ]);

    await expect(resolveProviderRoute(provider("codex"), classifyTask({ task: "Fix a typo" }), { codexHome }))
      .resolves.toMatchObject({ model: "gpt-5.6-luna", effort: "low" });
    await expect(resolveProviderRoute(provider("codex"), classifyTask({ task: "Implement the plan" }), { codexHome }))
      .resolves.toMatchObject({ model: "gpt-5.6-terra", effort: "medium" });
    await expect(resolveProviderRoute(provider("codex"), classifyTask({ task: "Root cause the security bug" }), { codexHome }))
      .resolves.toMatchObject({ model: "gpt-5.6-sol", effort: "high" });
  });

  it("falls back to generally available models when GPT-5.6 is absent", async () => {
    const codexHome = await makeCodexHome([{ slug: "gpt-5.5", efforts: ["high", "xhigh"] }]);
    const decision = classifyTask({ task: "Work autonomously across the entire repository" });

    await expect(resolveProviderRoute(provider("codex"), decision, { codexHome }))
      .resolves.toMatchObject({ model: "gpt-5.5", effort: "xhigh" });
  });

  it("never chooses ultra automatically but permits a supported explicit override", async () => {
    const supportedHome = await makeCodexHome([
      { slug: "gpt-5.6-sol", efforts: ["high", "max", "ultra"] }
    ]);
    const unsupportedHome = await makeCodexHome([
      { slug: "gpt-5.6-luna", efforts: ["low", "medium", "high", "max"] }
    ]);
    const decision = classifyTask({ task: "Work autonomously across the entire repository" });

    await expect(resolveProviderRoute(provider("codex"), decision, { codexHome: supportedHome }))
      .resolves.toMatchObject({ effort: "max" });
    await expect(resolveProviderRoute(provider("codex"), decision, {
      codexHome: supportedHome,
      effort: "ultra"
    })).resolves.toMatchObject({ effort: "ultra" });
    await expect(resolveProviderRoute(provider("codex"), decision, {
      codexHome: unsupportedHome,
      model: "gpt-5.6-luna",
      effort: "ultra"
    })).rejects.toThrow("does not advertise ultra reasoning");
  });

  it("rejects any explicit effort the selected Codex model does not advertise", async () => {
    const codexHome = await makeCodexHome([
      { slug: "gpt-5.5", efforts: ["low", "medium", "high", "xhigh"] }
    ]);
    const decision = classifyTask({ task: "Implement the plan" });

    await expect(resolveProviderRoute(provider("codex"), decision, {
      codexHome,
      model: "gpt-5.5",
      effort: "max"
    })).rejects.toThrow("does not advertise max reasoning");
  });

  it("applies a one-run override only to its target provider", async () => {
    const decision = classifyTask({ task: "Implement the plan" });

    await expect(resolveProviderRoute(provider("claude"), decision, {
      model: "gpt-5.6-sol",
      effort: "high",
      targetProvider: "codex"
    })).resolves.toMatchObject({ model: "sonnet", effort: "medium" });
  });

  it("injects model flags before the provider prompt", async () => {
    const route = await resolveProviderRoute(
      provider("claude"),
      classifyTask({ task: "Implement the plan" })
    );
    const launch = applyRouteToLaunch({ command: "claude", args: ["task prompt"] }, route);

    expect(launch.args).toEqual(["--model", "sonnet", "--effort", "medium", "task prompt"]);
  });
});
