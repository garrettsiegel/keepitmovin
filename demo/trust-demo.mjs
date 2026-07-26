// Pre-trusts the demo config so the recording doesn't stop on the trust prompt
// (the demo defines custom `bash agent.sh` tools, which the trust gate guards).
// Usage: KEEPITMOVIN_HOME=<dir> node <repo>/demo/trust-demo.mjs <config-path>
// Resolves the built trust helper relative to this file so cwd doesn't matter.
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const trustModule = pathToFileURL(path.join(here, "..", "dist", "config", "trust.js")).href;
const configPath = process.argv[2];

if (!configPath) {
  console.error("usage: node trust-demo.mjs <config-path>");
  process.exit(1);
}

// Trust the *real* path — keepitmovin loads the config via its realpath (e.g. macOS
// /tmp -> /private/tmp), and the trust store is keyed by that resolved path.
// Fail loudly. This ran for months pointing at a dist path that no longer
// existed; the tape ignored the error and the recording silently stopped on the
// trust prompt instead.
const resolved = realpathSync(path.resolve(configPath));
let trustConfigFile;
try {
  ({ trustConfigFile } = await import(trustModule));
} catch (error) {
  console.error(`trust-demo: cannot load ${trustModule} — run \`pnpm build\` first.\n${error}`);
  process.exit(1);
}
await trustConfigFile(resolved);
console.log(`trust-demo: trusted ${resolved}`);
