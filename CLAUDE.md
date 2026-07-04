# CLAUDE.md — CodePass

CodePass is an interactive terminal harness for coding agents. It launches a coding tool
(Claude Code, Codex, Antigravity, opencode, Cline, …) inside a PTY, watches its output, and on a
recognizable limit/failure builds a handoff file and switches to the next configured provider. It
also has an older non-interactive **task mode** (`codepass run "task"`) that runs a task through a
fallback chain.

For product/UX context see [README.md](./README.md), [HARNESS_VISION.md](./HARNESS_VISION.md), and
the provider catalog notes in [POPULAR_TOOLS.md](./POPULAR_TOOLS.md). This file is the agent-facing
build/architecture/gotcha guide. Monorepo-wide conventions live in the root
[AGENTS.md](../../AGENTS.md).

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

Two execution modes share config, git context, and the handoff/continuity layer:

- **Interactive harness** (`src/harness.ts`) — the primary `codepass` experience. Spawns a provider in a
  PTY (`node-pty`, with a piped-`child_process` fallback), mirrors stdin/stdout, keeps a
  `RollingTranscript`, watches live output for failures, and hands off on failure or `Ctrl+]`.
- **Task mode** (`src/run.ts` → `src/provider.ts`) — runs a task non-interactively through the
  fallback chain via `execa`. Classifies errors only after the process exits.

Supporting modules:

| Module | Role |
|---|---|
| `src/config.ts` | Zod schema (`codepassConfigSchema`) — the config contract + defaults. All config shape changes go here. |
| `src/provider-catalog.ts` | **Single source of truth** for every known tool (commands, args, integration type, install/auth notes). Add a tool here — do not scatter provider details across files. |
| `src/errors.ts` | Error taxonomy + pattern matching (`classifyError`). |
| `src/handoff-file.ts`, `src/context.ts` | Build the `.codepass/current/handoff.md` continuity artifact. |
| `src/doctor.ts`, `src/setup.ts`, `src/updates.ts` | DX: health check, guided wizard, tool self-update. |
| `src/index.ts` | The public export surface (barrel) — keep exports intentional. |
| `src/cli.ts` | `commander` command wiring. |

## Conventions

- ESM throughout: import with explicit `.js` specifiers (e.g. `from "./config.js"`), TypeScript
  `module`/`moduleResolution` NodeNext.
- The zod schema in `config.ts` is the contract; `types.ts` mirrors it (`CodePassConfig = z.infer<…>`).
- To add/modify a provider, edit the `PROVIDER_CATALOG` entry in `provider-catalog.ts`; defaults flow
  out through `getDefaultInteractiveProviders` / `getDefaultTaskProviders` / `mergeCatalogInteractiveProviders`.
- Artifacts live under `.codepass/` (handoffs, sessions, runs, logs).

## Gotchas

- **Harness failure detection scans live provider output.** `detectFallbackError` in `harness.ts`
  classifies the transcript while the tool streams. Broad substring patterns can false-positive on an
  agent that merely *discusses* a rate limit. Changing patterns in `errors.ts` or the detection scope
  can cause unwanted mid-session switches — test both "prose mentions a limit → no switch" and "real
  limit banner → switch".
- **The two modes classify errors differently.** Task mode only classifies after a non-zero exit (safe).
  The harness classifies streamed output live (riskier). Keep this distinction in mind when touching
  error handling.
- **PTY vs. pipe fallback.** When `node-pty` can't load, the harness falls back to a piped
  `child_process` that lacks TTY semantics (no resize, degraded interactivity). Guard PTY-only calls
  (e.g. `resize`) for the fallback.

## When Something Notable Happens

Record errors, preferences, or structural decisions in the **Notable Decisions & Lessons** section of
the root [AGENTS.md](../../AGENTS.md) so future agents stay informed.
