// Renders the homepage hero scene (site/src/components/HandoffMeter.astro) to
// public/hero-demo.gif for the README. The scene's timeline is a pure function
// of time, so each frame is an exact seek, not a screen recording — the loop is
// seamless and re-renders are identical. See demo/README.md for setup.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(repo, "site", "dist");
const output = path.join(repo, "public", "hero-demo.gif");
const FPS = 20;
const DURATION = 15; // Matches DURATION in site/src/lib/handoff-meter.ts.
const WIDTH = 960;

if (!existsSync(path.join(dist, "index.html"))) {
  console.error("site/dist is missing — build the site first (cd site && pnpm build).");
  process.exit(1);
}

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  if (!path.extname(file)) file = path.join(file, "index.html");
  let body;
  try {
    body = readFileSync(file);
  } catch {
    return res.writeHead(404).end();
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(body);
}).listen(0);
const port = server.address().port;

const frames = mkdtempSync(path.join(tmpdir(), "hero-frames-"));
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH + 80, height: 1000 }, colorScheme: "dark" });
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => document.fonts.ready);
  const scene = page.locator("[data-hm]");
  await scene.scrollIntoViewIfNeeded();
  await scene.evaluate((node, width) => {
    node.style.width = `${width}px`;
    node.style.maxWidth = "none";
    node.style.margin = "0";
  }, WIDTH);

  const total = FPS * DURATION;
  for (let i = 0; i < total; i += 1) {
    const t = i / FPS;
    await scene.evaluate((node, t) => node.dispatchEvent(new CustomEvent("handoff-meter:seek", { detail: { t } })), t);
    await scene.screenshot({ path: path.join(frames, `${String(i).padStart(4, "0")}.png`) });
  }
} finally {
  await browser.close();
  server.close();
}

// Two-pass palette keeps the dark UI and the orange accent clean at a small size.
const ffmpeg = spawnSync(
  "ffmpeg",
  [
    "-v", "error", "-y", "-framerate", String(FPS), "-i", path.join(frames, "%04d.png"),
    "-filter_complex",
    "[0]split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop", "0", output
  ],
  { stdio: "inherit" }
);
rmSync(frames, { recursive: true, force: true });
if (ffmpeg.status !== 0) process.exit(ffmpeg.status ?? 1);
console.log(`Wrote ${path.relative(repo, output)}`);
