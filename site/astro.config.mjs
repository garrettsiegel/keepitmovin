import { defineConfig } from "astro/config";

// Domain-agnostic static build. When keepitmovin.dev goes live, set:
//   site: "https://keepitmovin.dev",
// so canonical URLs and the sitemap (if added later) resolve correctly.
// No `base` is set — the site deploys at the domain root.
export default defineConfig({
  output: "static"
});
