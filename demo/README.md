# README hero GIF

`public/hero-demo.gif` is rendered from the homepage hero scene —
`site/src/components/HandoffMeter.astro`, with its timeline in
`site/src/lib/handoff-meter.ts` — so the README and keepitmovin.dev always show the
same story: Claude Code's usage meter fills, the handoff card carries the task to
Codex, and the task bar never resets.

It is a designed illustration of the handoff, not a screen recording of the
harness. The scene's timeline is a pure function of time, so the renderer seeks
each frame exactly: the loop is seamless and re-renders are byte-for-byte stable.

## Regenerate

Needs Google Chrome and `ffmpeg` (`brew install ffmpeg`). From the repo root:

```sh
(cd site && pnpm build)                                       # the renderer serves site/dist
npm i --no-save --prefix demo playwright-core@1               # one-time; lands in demo/node_modules (gitignored)
node demo/render-hero-gif.mjs                                 # writes public/hero-demo.gif
```

About a minute: 300 frames (15 s at 20 fps) at 960 px wide, dark theme.

## Changing the scene

Edit the lines and handoff rows in `HandoffMeter.astro` (each has an `at` cue in
seconds) or the beats in `handoff-meter.ts` (`BEAT`, `DURATION`). If you change
`DURATION`, change it in `render-hero-gif.mjs` too. Preview any moment without
rendering by dispatching a seek on the scene in the browser console:

```js
document.querySelector("[data-hm]").dispatchEvent(new CustomEvent("handoff-meter:seek", { detail: { t: 7.75 } }));
```
