import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  assertConfigTrusted,
  computeCustomProviders,
  UntrustedConfigError
} from "../src/trust.js";
import type { KeepitmovinConfig, InteractiveProviderConfig } from "../src/types.js";
import { makeTempDir } from "./support/tmp.js";


const customProvider: InteractiveProviderConfig = {
  name: "totally-custom",
  label: "Custom Tool",
  enabled: true,
  command: "echo",
  args: ["pwned"],
  handoffArgs: ["{{handoffPrompt}}"],
  integrationType: "pty"
};

const withCustomProvider = (): KeepitmovinConfig => {
  const config = defaultConfig();
  config.harness.providers = [...config.harness.providers, customProvider];
  return config;
};

const writeConfigFile = async (dir: string, config: KeepitmovinConfig): Promise<string> => {
  const configPath = path.join(dir, "keepitmovin.config.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
};

describe("computeCustomProviders", () => {
  it("returns nothing for a catalog-only config", () => {
    expect(computeCustomProviders(defaultConfig())).toEqual([]);
  });

  it("flags a provider with no harness-catalog entry", () => {
    const custom = computeCustomProviders(withCustomProvider());
    expect(custom.map((provider) => provider.name)).toEqual(["totally-custom"]);
  });
});

describe("assertConfigTrusted", () => {
  it("does not prompt for a catalog-only config", async () => {
    const home = await makeTempDir("home");
    let prompted = false;
    await assertConfigTrusted({
      config: defaultConfig(),
      configPath: undefined,
      interactive: true,
      home,
      confirm: async () => {
        prompted = true;
        return true;
      }
    });
    expect(prompted).toBe(false);
  });

  it("throws before trusting when the user declines", async () => {
    const dir = await makeTempDir("repo");
    const home = await makeTempDir("home");
    const config = withCustomProvider();
    const configPath = await writeConfigFile(dir, config);

    await expect(
      assertConfigTrusted({
        config,
        configPath,
        interactive: true,
        home,
        confirm: async () => false
      })
    ).rejects.toBeInstanceOf(UntrustedConfigError);
  });

  it("remembers consent by config hash and re-prompts after an edit", async () => {
    const dir = await makeTempDir("repo");
    const home = await makeTempDir("home");
    const config = withCustomProvider();
    const configPath = await writeConfigFile(dir, config);
    let prompts = 0;
    const confirm = async (): Promise<boolean> => {
      prompts += 1;
      return true;
    };

    // First run prompts and records trust.
    await assertConfigTrusted({ config, configPath, interactive: true, home, confirm });
    // Second run with the identical file is silent.
    await assertConfigTrusted({ config, configPath, interactive: true, home, confirm });
    expect(prompts).toBe(1);

    // Editing the file invalidates the stored hash → prompt again.
    config.harness.providers[config.harness.providers.length - 1]!.args = ["different"];
    await writeConfigFile(dir, config);
    await assertConfigTrusted({ config, configPath, interactive: true, home, confirm });
    expect(prompts).toBe(2);
  });

  it("refuses hard when non-interactive", async () => {
    const dir = await makeTempDir("repo");
    const home = await makeTempDir("home");
    const config = withCustomProvider();
    const configPath = await writeConfigFile(dir, config);

    await expect(
      assertConfigTrusted({ config, configPath, interactive: false, home })
    ).rejects.toBeInstanceOf(UntrustedConfigError);
  });
});
