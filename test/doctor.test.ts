import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";

const makeTempDir = async (): Promise<string> => {
  const dir = path.join(os.tmpdir(), `codepass-doctor-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

describe("runDoctor", () => {
  it("reports provider availability and default paths", async () => {
    const cwd = await makeTempDir();
    const config = defaultConfig();
    config.providers = [
      {
        name: "node",
        enabled: true,
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeoutMs: 1_000
      },
      {
        name: "missing",
        enabled: true,
        command: "codepass-command-that-should-not-exist",
        args: [],
        timeoutMs: 1_000
      }
    ];
    await writeFile(
      path.join(cwd, "codepass.config.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );

    const summary = await runDoctor(cwd);

    expect(summary.usingDefaultConfig).toBe(false);
    expect(summary.readyProviderCount).toBe(1);
    expect(summary.providerHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "node", available: true }),
        expect.objectContaining({ name: "missing", available: false })
      ])
    );
    expect(summary.runsDir).toBe(path.join(cwd, ".codepass", "runs"));
  });

  it("reports the full popular provider catalog when requested", async () => {
    const cwd = await makeTempDir();

    const summary = await runDoctor(cwd, undefined, { includeAllCatalog: true });

    expect(summary.catalogProviderHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "antigravity", group: "harness", controllable: true }),
        expect.objectContaining({ name: "gemini", group: "guided", controllable: false }),
        expect.objectContaining({ name: "opencode", group: "harness", controllable: true }),
        expect.objectContaining({ name: "devin", group: "guided", controllable: false }),
        expect.objectContaining({ name: "github-copilot", group: "guided", integrationType: "cloud_link" })
      ])
    );
  });
});
