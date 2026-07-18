# keepitmovin-site

Marketing and docs site for [keepitmovin](https://github.com/garrettsiegel/keepitmovin) — the terminal tool that hands off between AI coding agents when one hits a rate limit.

Built with [Astro](https://astro.build), fully static output (`output: 'static'`), no backend, no SSR, no UI framework. Hand-rolled CSS lives in `src/styles/design-system.css`; the only JavaScript is the install-command copy button, the looping handoff simulation in the hero, and a tiny IntersectionObserver scroll-reveal. Type: Fraunces (display), Instrument Sans (body), JetBrains Mono — loaded from Google Fonts with `display=swap`.

This site lives at `site/` inside the [keepitmovin](https://github.com/garrettsiegel/keepitmovin)
repo. It is a standalone Astro package with its own `node_modules` — build it from this directory,
not through the CLI's workspace.

## Commands

Run from this `site/` directory:

```sh
pnpm install     # first time only
pnpm dev         # local dev server
pnpm build       # static build → dist/
pnpm preview     # serve the built dist/ locally
```

## Layout

- `src/pages/index.astro` — landing page (hero + live handoff sim, tools ticker, 3-step how-it-works, comparison split, tools wall, honest limitation, recorded demo)
- `src/pages/docs/` — docs section: overview, install, quickstart, how handoff works, supported tools, configuration, FAQ
- `src/layouts/BaseLayout.astro` — HTML shell, meta/OG tags, glass pill nav, footer, scroll-reveal observer
- `src/layouts/DocsLayout.astro` — docs shell with sidebar nav and active-page state
- `src/components/InstallCommand.astro` — install command with copy button
- `src/components/HandoffSim.astro` — looping typewriter simulation of a limit → handoff → resume
- `src/styles/design-system.css` — the whole design system (dark-first, light variant via `prefers-color-scheme`)
- `public/favicon.svg` — forward-motion glyph
- `public/opengraph.png` — social card (see note below)

The live handoff terminal in the hero (`HandoffSim.astro`) replaced the old demo GIF, so there is
no `demo.gif` to maintain.

### OG image note

`public/opengraph.png` exists but `og:image` isn't wired yet — OG needs an absolute URL and the
final domain isn't live. When `keepitmovin.dev` is set (below), point `og:image` at
`https://keepitmovin.dev/opengraph.png`.

## Deploying

The site is a plain static directory: build it, upload `dist/`. It lives at `site/` inside the
keepitmovin repo, so set the project root to `site` on each host (paths below are relative to the
repo root).

### Cloudflare Pages

- **Root directory:** `site`
- **Build command:** `pnpm build` (or `npx astro build`)
- **Build output directory:** `dist`

### Netlify

- **Base directory:** `site`
- **Build command:** `pnpm build`
- **Publish directory:** `site/dist` (or just `dist` when the base directory is set)

### Vercel

- **Root directory:** `site`
- **Framework preset:** Astro (auto-detected; build command `astro build`, output `dist`)

## Setting the final domain

`astro.config.mjs` intentionally leaves `site` and `base` unset so the build works on any host or preview URL. When `keepitmovin.dev` goes live:

```js
export default defineConfig({
  site: 'https://keepitmovin.dev',
  output: 'static',
});
```

Setting `site` enables canonical URLs and absolute OG URLs. Only set `base` if the site is ever served under a subpath.
