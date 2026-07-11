# CLAUDE.md — CodePass

CodePass is an interactive terminal harness for coding agents. It launches a coding tool
(Claude Code, Codex, Antigravity, opencode, Grok Build, Cursor Agent, Aider, Goose, Amp,
Factory Droid, GitHub Copilot CLI, Cline, Ollama, …) inside a PTY, watches its output, and
on a recognizable limit/failure builds a handoff file and switches to the next configured provider.

For product/UX context and project history see [README.md](./README.md) (usage) and
[GAMEPLAN.md](./GAMEPLAN.md) (original brief, design vision, and the V1 execution log). This file
is the agent-facing build/architecture/gotcha guide.

## Build / Test / Lint

Run from the monorepo root (prefer `~/Library/pnpm/pnpm` — see the pnpm PATH gotcha in root AGENTS.md):

```sh
~/Library/pnpm/pnpm --filter codepass build   # tsc -> dist/
~/Library/pnpm/pnpm --filter codepass test    # vitest run
~/Library/pnpm/pnpm --filter codepass lint    # tsc --noEmit
~/Library/pnpm/pnpm --filter codepass dev     # tsx src/cli.ts (run the CLI without building)
```

Before finishing any task: `build`, `test`, and `lint` must all pass. Then run root `pnpm build`
(Turborepo) to confirm the monorepo still builds.

## Architecture

CodePass has a single execution mode — the interactive harness (`src/harness.ts`, the `codepass`
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
| `src/config.ts` | Zod schema (`codepassConfigSchema`) — the config contract + defaults. All config shape changes go here. |
| `src/provider-catalog.ts`, `src/provider-catalog-data.ts`, `src/provider-catalog-extra.ts`, `src/provider-catalog-types.ts` | **Single source of truth** for every known tool (commands, args, integration type, install/auth notes, `limitPatterns`). Add core tools in `provider-catalog-data.ts` and opt-in tools in `provider-catalog-extra.ts` — do not scatter provider details across files. |
| `src/errors.ts` | Error taxonomy + generic pattern matching (`classifyError`, `matchLimitPattern`, `matchProviderLimitPattern`). |
| `src/handoff-file.ts` | Builds and maintains the `.codepass/current/handoff.md` continuity artifact and its prompts. |
| `src/handoff-refresh.ts`, `src/handoff-quality.ts` | Refresh mechanical handoff sections and measure whether the task/narrative was actually recorded. |
| `src/routing.ts`, `src/model-routing.ts`, `src/launch-routing.ts` | Deterministic task classification, local Codex model discovery, and launch-time routing/overrides. |
| `src/session-log.ts`, `src/session-outcome.ts` | Persist validated session telemetry and collect the one-time routed-task outcome. |
| `src/doctor.ts`, `src/provider-health.ts` | `codepass doctor` — provider health checks. |
| `src/setup.ts`, `src/setup-prompts.ts`, `src/tool-status.ts` | The guided setup wizard: orchestration, clack prompt helpers, tool-availability detection. |
| `src/updates.ts`, `src/update-runner.ts` | Tool self-update: orchestration + spinner UI, then the runner primitives. |
| `src/cli.ts`, `src/cli-options.ts`, `src/commands/*.ts` | `commander` command wiring; each command's logic lives in its own `src/commands/<name>.ts`. |
| `src/index.ts` | The public export surface (barrel) — keep exports intentional. |

## Conventions

- ESM throughout: import with explicit `.js` specifiers (e.g. `from "./config.js"`), TypeScript
  `module`/`moduleResolution` NodeNext.
- The zod schema in `config.ts` is the contract; `types.ts` mirrors it (`CodePassConfig = z.infer<…>`).
- To add/modify a provider, edit the `PROVIDER_CATALOG` entry in `provider-catalog-data.ts`; defaults
  flow out through `getDefaultInteractiveProviders` / `mergeCatalogInteractiveProviders`
  (`provider-catalog.ts`).
- Files stay ≤250 LOC — split by extracting a focused module (see the harness/setup/updates/doctor
  splits above) rather than letting one file grow.
- Artifacts live under `.codepass/` (handoffs, sessions).

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
- **PTY vs. pipe fallback.** When `node-pty` can't load, the harness falls back to a piped
  `child_process` (`pty-factory.ts`) that lacks TTY semantics (no resize, degraded interactivity).
  Guard PTY-only calls (e.g. `resize`) for the fallback.
- **Prompt transport.** Claude, Codex, Antigravity, opencode, Grok Build, Cursor Agent, Factory Droid,
  and Cline receive the initial or handoff prompt as launch arguments. Ollama, Aider, Goose, Amp,
  and GitHub Copilot CLI use PTY bootstrap paste (their one-shot prompt flags exit after a turn).
  Keep transport prompts out of final transcript excerpts when a tool merely echoes its argv.
- **Routing is local and opt-in.** The classifier must remain deterministic and fail soft when the
  Codex model cache is missing. Automatic routing never selects `ultra`; explicit overrides must
  be validated against the model's advertised reasoning levels.

## When Something Notable Happens

Record errors, preferences, or structural decisions in the **Notable Decisions & Lessons** section of
the root [AGENTS.md](../../AGENTS.md) so future agents stay informed.
