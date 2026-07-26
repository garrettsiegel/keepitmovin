# CLAUDE.md — keepitmovin

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

keepitmovin is an interactive terminal harness for coding agents. It launches a coding tool
(Claude Code, Codex, Antigravity, opencode, Grok Build, Cursor Agent, GitHub Copilot CLI,
Ollama — plus hidden entries such as Aider, Goose, Amp, Factory Droid and Cline, which stay in
the catalog but are excluded from defaults and docs) inside a PTY, watches its output, and
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

keepitmovin has a single execution mode — the interactive harness (`src/harness.ts`, the `kim`
experience). It spawns a provider in a PTY (`node-pty`, with a piped-`child_process` fallback),
mirrors stdin/stdout, keeps a `RollingTranscript`, watches live output for failures, and hands off
on failure or `Ctrl+]`. `runHarness` (the orchestration loop) is split across three modules:

| Module | Role |
|---|---|
| `src/harness.ts` | `runHarness` — the provider loop, handoff/checkpoint calls, commercial-break interstitial, session logging. |
| `src/harness-session.ts` | `waitForProvider` — spawns one provider attempt, mirrors I/O, idle timeout, manual-switch key, cleanup. |
| `src/failure-detection.ts` | Live/post-exit failure classification (`detectLiveFailure`/`detectExitFailure`), the prose-vs-status-line guard, manual-switch key mapping. |
| `src/pty-factory.ts` | PTY process adapter + node-pty/pipe-fallback factories. |

Other supporting modules:

| Module | Role |
|---|---|
| `src/config.ts` | Zod schema (`keepitmovinConfigSchema`) — the config contract + defaults. All config shape changes go here. |
| `src/provider-catalog.ts`, `src/provider-catalog-data.ts`, `src/provider-catalog-more.ts`, `src/provider-catalog-extra.ts`, `src/provider-catalog-types.ts` | **Single source of truth** for every known tool (commands, args, integration type, install/auth notes, `limitPatterns`). The nine fully-supported tools live in `-data.ts` (part 1 + the `PROVIDER_CATALOG` assembler) and `-more.ts` (part 2), split only to stay under 250 LOC; catalog order across the two drives the default fallback chain. Hidden tools (`supportLevel: "hidden"`) live in `-extra.ts` — kept in the catalog so existing configs keep launching, but excluded from defaults, the setup wizard, and docs (see `isHiddenCatalogEntry`/`isHiddenProviderName`). Do not scatter provider details across other files. |
| `src/errors.ts` | Error taxonomy + generic pattern matching (`classifyError`, `matchLimitPattern`, `matchProviderLimitPattern`). |
| `src/handoff-file.ts` | Builds and maintains the `.keepitmovin/current/handoff.md` continuity artifact and its prompts. |
| `src/handoff-refresh.ts`, `src/handoff-quality.ts` | Refresh mechanical handoff sections and measure whether the task/narrative was actually recorded. |
| `src/routing.ts`, `src/model-routing.ts`, `src/launch-routing.ts` | Deterministic task classification, local Codex model discovery, and launch-time routing/overrides. |
| `src/session-log.ts`, `src/session-outcome.ts` | Persist validated session telemetry and collect the one-time routed-task outcome. |
| `src/doctor.ts`, `src/provider-health.ts` | `kim doctor` — provider health checks. |
| `src/setup.ts`, `src/setup-prompts.ts`, `src/tool-status.ts` | The guided setup wizard: orchestration, clack prompt helpers, tool-availability detection. |
| `src/updates.ts`, `src/update-runner.ts` | Tool self-update: orchestration + spinner UI, then the runner primitives. |
| `src/cli.ts`, `src/cli-options.ts`, `src/commands/*.ts` | `commander` command wiring; each command's logic lives in its own `src/commands/<name>.ts`. |
| `src/index.ts` | The public export surface (barrel) — keep exports intentional. |

## Beyond `src/`

| Dir | What it is |
|---|---|
| `site/` | The keepitmovin.dev website — Astro 7, fully static, no UI framework. **Standalone package (`keepitmovin-site`) with its own `pnpm-lock.yaml`, separate from this package** — run `pnpm install` / `pnpm dev` / `pnpm build` from inside `site/`. Deployed on Vercel (frozen lockfile install, so keep `site/pnpm-lock.yaml` in sync with its `package.json`). Docs pages mirror README wording — re-sync them when README behavior changes. |
| `demo/` | VHS recording setup for the README hero GIF (`public/kim-demo.gif`). It drives the **real** harness; only the agents are stubs (`agent.sh`), with catalog-avoiding internal names `demo-a`/`demo-b`. See `demo/README.md` before regenerating. |
| `scripts/` | `release.sh` (the `pnpm release` flow). |

## Conventions

- ESM throughout: import with explicit `.js` specifiers (e.g. `from "./config.js"`), TypeScript
  `module`/`moduleResolution` NodeNext.
- The zod schema in `config.ts` is the contract; `types.ts` mirrors it (`KeepitmovinConfig = z.infer<…>`).
- To add/modify a provider, edit the `PROVIDER_CATALOG` entry in `provider-catalog-data.ts`; defaults
  flow out through `getDefaultInteractiveProviders` / `mergeCatalogInteractiveProviders`
  (`provider-catalog.ts`).
- Files stay ≤250 LOC — split by extracting a focused module (see the harness/setup/updates/doctor
  splits above) rather than letting one file grow.
- Artifacts live under `.keepitmovin/` (handoffs, sessions).

## Gotchas

- **Harness failure detection scans live provider output.** `detectLiveFailure` in
  `failure-detection.ts` classifies the transcript while the tool streams (called from the PTY
  loop in `harness-session.ts`). Broad substring patterns can false-positive on an
  agent that merely *discusses* a rate limit. Detection has two layers: the generic families in
  `errors.ts` (`matchLimitPattern`), trusted only on a *status-like line* (prose guard), and a
  provider's curated `limitPatterns` (defined per-tool in `provider-catalog-data.ts`, matched via
  `matchProviderLimitPattern` in `errors.ts`), which are exact tool banners. Both layers require a
  status-like line before switching — provider banners use the *strict* variant of
  `isStatusLikeLine` (the banner must head its line or follow an error indicator), so a banner
  quoted in an agent's prose won't force a handoff. Keep banners specific anyway. A third guard,
  `isUsageWarning` in `errors.ts`, drops any line that reads as an "approaching your limit"
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
  `child_process` (`pty-factory.ts`) that lacks TTY semantics (no resize, degraded interactivity).
  Guard PTY-only calls (e.g. `resize`) for the fallback.
- **Prompt transport.** Claude, Codex, Antigravity, opencode, Grok Build, Cursor Agent (and hidden
  Cline, Factory Droid) receive the initial or handoff prompt as launch arguments. Kimi CLI, GitHub
  Copilot CLI, Ollama (and hidden Aider, Goose, Amp) use PTY bootstrap paste (their one-shot prompt
  flags exit after a turn). Keep transport prompts out of final transcript excerpts when a tool
  merely echoes its argv.
- **Routing is local and opt-in.** The classifier must remain deterministic and fail soft when the
  Codex model cache is missing. Automatic routing never selects `ultra`; explicit overrides must
  be validated against the model's advertised reasoning levels.

## When Something Notable Happens

Record errors, preferences, or structural decisions here (in Gotchas, or the relevant section
above) so future agents stay informed. When this package sits inside the personal monorepo, also
mirror cross-cutting lessons into that repo's AGENTS.md.
