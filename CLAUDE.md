# CLAUDE.md — keepitmovin

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

keepitmovin is an interactive terminal harness for coding agents. It launches a coding tool
(Claude Code, Codex, Antigravity, opencode, Grok Build, Cursor Agent, GitHub Copilot CLI,
Ollama) inside a PTY, watches its output, and
on a recognizable limit/failure builds a handoff file and switches to the next configured provider.

For product/UX context see [README.md](./README.md) (usage). This file is the agent-facing
build/architecture/gotcha guide.

## Build / Test / Lint

This repo is self-contained — it builds from a plain clone with no workspace or Turborepo
around it. Run everything from the repo root:

```sh
pnpm install   # --frozen-lockfile in CI
pnpm build     # tsc -> dist/
pnpm test      # vitest run
pnpm lint      # tsc --noEmit
pnpm dev       # tsx src/cli.ts (run the CLI without building)

# Single test file (extra args pass through to `vitest run` as filters):
pnpm test test/errors.test.ts
```

Tests live in `test/<module>.test.ts`, one file per `src/` module (vitest defaults, no
`vitest.config`). Releases go through `pnpm release <patch|minor|major>` (`scripts/release.sh`:
version bump + tag + push; supports `--dry-run`). Publishing happens in CI from the tag
(`.github/workflows/release.yml`) with npm provenance — never from a laptop.

Before finishing any task: `build`, `test`, and `lint` must all pass.

> When this package is checked out inside the personal monorepo, the surrounding workspace's
> pnpm quirks apply (see that repo's AGENTS.md). Nothing in this repo depends on them.

## Architecture

keepitmovin has a single execution mode — the interactive harness (`src/harness/`, the `kim`
experience). It spawns a provider in a PTY (`node-pty`, with a piped-`child_process` fallback),
mirrors stdin/stdout, keeps a `RollingTranscript`, watches live output for failures, and hands off
on failure or `Ctrl+]`.

`src/` is grouped by domain. Each folder is self-contained; the only files at the root are the CLI
entry points. There is no public barrel — keepitmovin ships as a `bin`, not a library, so
`package.json` declares no `main`/`types` and nothing re-exports the internals.

| Folder | Role |
|---|---|
| `src/harness/` | The orchestration loop. `index.ts` = `runHarness` (provider loop, checkpoints, commercial-break interstitial); `session.ts` = `waitForProvider` (one provider attempt); `io.ts` (stdin/stdout/signal wiring), `attempt.ts` + `attempt-log.ts`, `observers.ts`, `watchers.ts`, `finalize.ts`, plus `transcript.ts`, `bootstrap-input.ts`, `switch-menu.ts` and the `watchdog*.ts` signals. Several are single-caller by design: `session.ts` is already at the LOC cap, so folding them back in would produce one ~550-line file on the least-unit-tested path in the repo. |
| `src/detection/` | `failure-detection.ts` (live/post-exit classification, the prose-vs-status-line guard, manual-switch key mapping) and `errors.ts` (error taxonomy + generic pattern matching). |
| `src/providers/` | **Single source of truth** for every known tool. `catalog.ts` is the public API; `catalog-entries.ts` is the whole `PROVIDER_CATALOG` in one list — **its order is the default fallback chain**, so entry order is behavior. It is pure data and exempt from the 250-LOC cap. Also `catalog-types.ts`, `interactive.ts`, `health.ts`, `tool-status.ts`. Do not scatter provider details elsewhere. |
| `src/config/` | `index.ts` (load/save/normalize), `config-schema.ts` (the zod contract + defaults — all config shape changes go here), `types.ts` (inferred from the schema), `trust.ts`. |
| `src/handoff/` | `file.ts` builds and maintains the `.keepitmovin/current/handoff.md` continuity artifact; `refresh.ts` and `quality.ts` refresh mechanical sections and measure whether the task/narrative was recorded; `cleanup.ts` resolves handoff paths and does the destructive `kim clear` work; plus `receipt.ts`, `prompts.ts`. |
| `src/probes/` | `usage.ts` and `compaction.ts` — reading a tool's own on-disk usage/compaction state. |
| `src/routing/` | `classify.ts` (deterministic task classification), `model.ts` (local Codex model discovery), `launch.ts` (launch-time routing). Off by default; the schema lives in `config/routing-schema.ts`. |
| `src/mcp/` | `server.ts`, `data.ts`, `clients.ts`, `installer.ts` — the read-only MCP server and its installers. |
| `src/setup/` | The guided setup wizard (`index.ts`, `prompts.ts`) and tool self-update (`updates.ts`, `update-runner.ts`). |
| `src/pty/` | `factory.ts` (PTY process adapter + node-pty/pipe-fallback factories) and `helper.ts`. |
| `src/ui/` | `terminal.ts` (boxes, status views, switch copy) and `restore.ts` (raw-mode/cursor recovery). |
| `src/util/` | `paths.ts`, `redact.ts`, `git.ts`, `gitignore-marker.ts` (writes `.keepitmovin/.gitignore`), `session-log.ts` (persist/read validated session telemetry). |
| `src/commands/` | One file per CLI command; `src/cli.ts` + `src/cli-options.ts` do the `commander` wiring. |
| `src/doctor.ts` | `kim doctor` — provider health checks (pairs with `providers/health.ts`). |

## Beyond `src/`

| Dir | What it is |
|---|---|
| `site/` | The keepitmovin.dev website — Astro 7, fully static, no UI framework. **Standalone package (`keepitmovin-site`) with its own `pnpm-lock.yaml`, separate from this package** — run `pnpm install` / `pnpm dev` / `pnpm build` from inside `site/`. Deployed on Vercel (frozen lockfile install, so keep `site/pnpm-lock.yaml` in sync with its `package.json`). Docs pages mirror README wording — re-sync them when README behavior changes. |
| `demo/` | VHS recording setup for the README hero GIF (`public/kim-demo.gif`). It drives the **real** harness; only the agents are stubs (`agent.sh`), with catalog-avoiding internal names `demo-a`/`demo-b`. See `demo/README.md` before regenerating. |
| `scripts/` | `release.sh` (the `pnpm release` flow). |

## Conventions

- ESM throughout: import with explicit `.js` specifiers (e.g. `from "./config/index.js"`), TypeScript
  `module`/`moduleResolution` NodeNext.
- The zod schema in `config/config-schema.ts` is the contract; `config/types.ts` mirrors it (`KeepitmovinConfig = z.infer<…>`).
- To add/modify a provider, edit the `PROVIDER_CATALOG` entry in `providers/catalog-entries.ts`; defaults
  flow out through `getDefaultInteractiveProviders` / `mergeCatalogInteractiveProviders`
  (`providers/catalog.ts`).
- Files stay ≤250 LOC — split by extracting a focused module (see the harness/setup/updates/doctor
  splits above) rather than letting one file grow. **Pure data files are exempt**
  (`providers/catalog-entries.ts`): splitting a list to satisfy a line count hides that its order
  is behavior, and the split it used to have left a comment pointing at a file that did not exist.
- Artifacts live under `.keepitmovin/` (handoffs, sessions). Their paths are constants in
  `config/config-schema.ts`, not config — a user-settable handoff path aimed the destructive
  `kim clear` at arbitrary files.
- CLI commands are wrapped in `withConfig` (`cli-options.ts`), which resolves the cwd, loads the
  config, and turns a throw into one red line plus a non-zero exit code.

## Gotchas

- **Harness failure detection scans live provider output.** `detectLiveFailure` in
  `detection/failure-detection.ts` classifies the transcript while the tool streams (called from the PTY
  loop in `harness/session.ts`). Broad substring patterns can false-positive on an
  agent that merely *discusses* a rate limit. Detection has two layers: the generic families in
  `detection/errors.ts` (`matchLimitPattern`), trusted only on a *status-like line* (prose guard), and a
  provider's curated `limitPatterns` (defined per-tool in `providers/catalog-entries.ts`, matched via
  `matchProviderLimitPattern` in `detection/errors.ts`), which are exact tool banners. Both layers require a
  status-like line before switching — provider banners use the *strict* variant of
  `isStatusLikeLine` (the banner must head its line or follow an error indicator), so a banner
  quoted in an agent's prose won't force a handoff. Keep banners specific anyway. A third guard,
  `isUsageWarning` in `detection/errors.ts`, drops any line that reads as an "approaching your limit"
  percentage notice (a 1–99% figure tied to a limit, e.g. Claude Code's *"You've used 92% of your
  session limit"*) before the pattern layers run — such warnings are **not** limit-hit events.
  Because ink TUIs wrap a row into multiple real lines, the check folds in the *previous* line as
  context (the `92%` and the word `limit` can land on separate lines). Relatedly,
  `RollingTranscript.excerpt()` drops a leading partial line so a mid-line slice can't spoof the
  `startsWith` prose guard. Changing any layer, or the detection scope, can cause unwanted
  mid-session switches — test all of "prose mentions a limit → no switch", "percentage warning
  (flat and TUI-wrapped) → no switch", and "real limit banner → switch".
- **Never run `pnpm install` inside `site/` while this repo sits inside the personal
  monorepo.** `site/` is standalone with its own lockfile, but pnpm walks up, finds the
  monorepo's `pnpm-workspace.yaml`, and installs against *that* root — it rewrites the
  monorepo lockfile, installs unrelated packages, and leaves `site/pnpm-lock.yaml`
  untouched, so `site/package.json` and its lockfile silently disagree and every
  `--frozen-lockfile` build (CI and Vercel) then fails. Copy `site/` plus the repo's
  `CHANGELOG.md` to a directory outside the monorepo, install there, and copy
  `package.json` + `pnpm-lock.yaml` back. CI and Vercel are unaffected: they check out
  this repo standalone, with no workspace above it.
- **`site/src/pages/changelog.astro` reads the repo-root `CHANGELOG.md` via
  `process.cwd()`, not `import.meta.url`.** Astro 7 bundles prerendered pages into
  `dist/.prerender/chunks/`, so a path relative to the module resolves to
  `site/CHANGELOG.md` and the build dies with ENOENT. Keep it cwd-relative.
- **PTY vs. pipe fallback.** When `node-pty` can't load, the harness falls back to a piped
  `child_process` (`pty/factory.ts`) that lacks TTY semantics (no resize, degraded interactivity).
  Guard PTY-only calls (e.g. `resize`) for the fallback.
- **Prompt transport.** Claude, Codex, Antigravity, opencode, Grok Build and Cursor Agent receive
  the initial or handoff prompt as launch arguments. Kimi CLI, GitHub Copilot CLI and Ollama use PTY
  bootstrap paste (their one-shot prompt flags exit after a turn). Keep transport prompts out of
  final transcript excerpts when a tool merely echoes its argv.
- **Routing is local and opt-in.** The classifier must remain deterministic and fail soft when the
  Codex model cache is missing. Automatic routing never selects `ultra`. `--tier` is the only
  routing flag; it is validated against `routingTierSchema` before it reaches the classifier.
- **`kim` must reach the user's tool without asking anything.** Nothing on the launch path may add
  a prompt: not update checks (`updates.checkOnStart` defaults to false for this reason), not a
  chain confirmation, not a routing confirmation. Setup asks one question; every later run asks
  zero. Adding a prompt to the launch path is a regression even when the prompt is useful — put it
  behind a command instead.
- **A config option needs a reason to exist.** Eleven were removed in v4 because their only sane
  value was the default; each was replaced by a constant in `config/config-schema.ts`. Before
  adding one, check that two users would plausibly set it differently. If a test is the only thing
  that needs to vary a value, take it as an optional function parameter instead — see
  `NudgeTiming` in `handoff/refresh.ts`, threaded through `runHarness` as `nudgeTiming`.
- **Removed config keys and removed provider names must still load.** Old configs are parsed with
  the current schema, which strips unknown keys, and an unrecognized provider name is kept as a
  user-defined command rather than rejected. `test/config.test.ts` pins this against a real v3
  config fixture (`test/fixtures/legacy-v3-config.json`); keep the fixture when adding migrations.

## When Something Notable Happens

Record errors, preferences, or structural decisions here (in Gotchas, or the relevant section
above) so future agents stay informed. When this package sits inside the personal monorepo, also
mirror cross-cutting lessons into that repo's AGENTS.md.
