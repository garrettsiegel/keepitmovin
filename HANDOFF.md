# HANDOFF.md — Simplification plan for keepitmovin

**For: Opus 5 (implementing model). From: a full-codebase review run on 2026-07-26.**

Read `CLAUDE.md` in this repo first — it has the architecture map, conventions, and gotchas.
Then work through the phases below **in order**. Each phase ends with a verification gate.

## Ground rules

- After every phase: `pnpm build && pnpm test && pnpm lint` must all pass before moving on.
- Keep files ≤250 LOC **except** pure data files (see Phase 8 — that exemption is part of this plan).
- Update `README.md` and `CLAUDE.md` whenever a phase changes user-facing behavior or file layout.
- The `site/` docs mirror README wording — after README changes, update the matching pages under `site/src/pages/` (do **not** run `pnpm install` inside `site/`; see the gotcha in CLAUDE.md).
- Commit after each phase with a conventional-commit message so phases are individually revertable.
- When everything is done: run the full gate one last time, update the Notable Decisions & Lessons notes per CLAUDE.md, then **delete this HANDOFF.md file**.

## Decisions already made (Garrett can flip these before you start)

1. **Routing stays but shrinks** (Phase 6): keep the subsystem, keep only the `--tier` flag, remove `--model`, `--effort`, `--no-route`, the mid-launch tier-override prompt, and the end-of-session outcome prompt. It stays off by default. *(Alternative Garrett may choose: delete `src/routing/` entirely.)*
2. **MCP stays but collapses** (Phase 6): keep the server, collapse the 4 subcommands into fewer entry points. *(Alternative: extract to a separate package.)*
3. **Hidden providers get deleted** (Phase 7): Aider, Goose, Amp, Factory Droid, Cline are removed from the catalog entirely, along with the `supportLevel: "hidden"` machinery. This is a breaking change for anyone who configured them — acceptable; they were never verified or documented.
4. This is collectively a **breaking release**: plan for the final commit series to land as v4.0.0 (but do NOT run `pnpm release` — Garrett releases manually).

---

## Phase 1 — Kill launch friction (small)

1. **Remove the "Start with this order?" confirmation** that fires before every launch: `src/commands/launch.ts:35-43`. On launch, print the provider chain (keep the existing chain display) and start immediately. `kim providers` remains the way to change order.
2. **Default provider-update checks to non-blocking**: in `src/config/config-schema.ts` (~line 85-86) change `updates.checkOnStart` / `mode: "prompt"` defaults so nothing prompts before the tool launches (either default `checkOnStart: false` or default mode to a non-interactive notice). Keep the config knob so users can opt back in.
3. Update tests that asserted the confirmation prompt (search `test/` for the launch flow), README's "How It Works", and the demo tape in `demo/` **only if** it scripted the confirmation.

**Gate:** `kim` (via `pnpm dev`) goes from invocation to provider launch with zero prompts on a machine that already has a config.

## Phase 2 — Merge duplicate commands (small)

1. `src/commands/setup.ts:5-11` and `src/commands/providers.ts:5-12` are byte-identical calls to `runSetupWizard({force:true})` (providers adds `showAllCatalog`). Keep **`kim providers`** as the one wizard command; make `kim setup` a hidden alias of it (commander `.alias()` or a hidden command) so muscle memory doesn't break, and remove its README row.
2. Delete **`kim init`** (`src/cli.ts:69-75` and `src/commands/init.ts`): the default `kim` run already creates config + folders via `runSetupWizard` (`src/commands/launch.ts:23`).
3. Delete the 4 dead fields in the CLI options type that no flag ever sets: `dryRun`, `maxRetries`, `printPrompt`, `provider` (`src/cli-options.ts:10-14`).
4. Declare `--config` / `--cwd` **once** as program-level global options instead of repeating them on 9 commands (`src/cli.ts:56-57, 71-72, 80-81, 90-91, 99-100, 110-111, 119-120, 129-130, 142`), and delete the `resolveCommandOptions` normalizer + its explanatory comment (`src/cli-options.ts:38-53`). Verify commander 15 propagates program-level opts to subcommand handlers (use `program.opts()` merged in one place).
5. Update `test/cli*.test.ts` (whatever covers command wiring), README command table (`README.md:~245`).

**Gate:** `kim --help` shows the reduced surface; all commands still receive `--config`/`--cwd`.

## Phase 3 — First-run wizard: 6 prompts → 2 (medium)

Target flow: **(1)** multi-select "Which tools do you want to use?" → **(2)** confirm/summary. Everything else goes.

1. Collapse the 4 informational panes (intro box, "How it works", updates note, catalog note — `src/setup/index.ts:80-110`) into one short intro line above the tool picker.
2. Delete the Cline/OpenRouter question (`src/setup/index.ts:147-152`) — its "yes" branch only logs a sentence (`:155`). (Moot anyway after Phase 7 removes Cline.)
3. Delete the routing on/off question (`src/setup/index.ts:158-161`). Routing stays config/flag-enabled only.
4. Replace the N-1 sequential ordering prompts (`src/setup/prompts.ts:27-42`) with: default to catalog order for the selected tools, show the resulting chain, and offer a single optional "reorder?" that only triggers the per-slot selects if the user asks.
5. Update `test/setup*.test.ts` and the README setup section.

**Gate:** fresh machine simulation (no config file) — `kim` reaches provider launch after answering exactly the tool picker (plus optional reorder if requested).

## Phase 4 — Config diet (medium)

1. **Shrink `keepitmovin.config.example.json` from 266 lines to ~15**: only `providerOrder` plus one or two illustrative overrides. Providers come from the catalog at load time (`mergeCatalogInteractiveProviders`; `src/config/trust.ts:30-38` forces catalog commands), so the ~200-line provider array (`lines 66-266`) must go.
2. **Remove ~12 config leaves whose defaults are fine** — delete from `src/config/config-schema.ts` and everywhere they're read:
   - `context.maxDiffChars` (~:79), `logs.sessionsDir` (~:82)
   - `harness.transcriptLimitChars` (~:93), `handoffPath` (~:94), `handoffArchiveDir` (~:95), `idleTimeoutMs` (~:97, default 0 = already disabled), `autoAppendCheckpoints` (~:98)
   - `harness.watchdog.action` (~:122) — it's `z.literal("warn")`, a one-value enum; hardcode warn behavior
   - `handoffRefresh.nudge.*` — the 4 timing knobs (~:112-115); hardcode the defaults
   - the top-level `fallbackOn` (~:70-77) **or** the per-provider `fallbackOn` (~:63) — two places express the same policy; keep per-provider, delete global (fold the global default into normalization).
   - routing sub-flags `promptForTask` / `allowOverride` / `askOutcome` / `telemetry` (`src/routing/config.ts:8-11`) — see Phase 6; `enabled` stays.
3. Normalization must stay backward-tolerant: old configs containing deleted keys must load without error (zod `.strip()` / passthrough-then-ignore), not crash. Add a test: v3 example config (copy the current 266-line file into a test fixture first) still loads.
4. Update the README config tables (`README.md:130-134, 153-158, 202-209`) — most of them disappear (Phase 5 relocates what's left).

**Gate:** `pnpm test` including the new legacy-config fixture test; example config ≤ ~20 lines.

## Phase 5 — README restructure (small)

Target shape, in order: pitch (1 short paragraph) → quick start (keep the existing 2-liner at `README.md:44-58`) → a **3-step** "How it works" (replace the 10-step list at `:86-101`) → command table → supported tools (listed **once** — currently at `:14-15`, `:34`, and `:216-226`) → link to deeper docs.

1. Move "The Important Limitation" (`:60`) below "How it works" and compress it to a few lines.
2. Move the remaining config reference tables and the routing/watchdog/handoffRefresh sections into `docs/configuration.md` (new file) and link it.
3. Move "Building From Source / Contributing / Releasing" (`:320-355`) into `CONTRIBUTING.md`.
4. Re-sync the affected `site/src/pages/` docs pages (wording mirrors README).

**Gate:** README ≤ ~150 lines; no information deleted outright — everything relocated is linked.

## Phase 6 — Shrink the bolt-ons: routing + MCP (medium)

**Routing** (`src/routing/`, 365 LOC; stays off by default — `src/routing/config.ts:7`):
1. Keep only the `--tier` CLI flag; delete `--model`, `--effort`, `--no-route` (`src/cli.ts:58-61`). Tier is the preset users actually need.
2. Delete the mid-launch tier-override prompt (`src/routing/launch.ts:47-65`) and the end-of-session "how did it go?" outcome prompt (`src/harness/finalize.ts:67` → `src/session/outcome.ts`). Delete `src/session/outcome.ts` and the now-dead routing sub-flags from Phase 4.
3. Keep the deterministic classifier and the fail-soft behavior on a missing Codex model cache (CLAUDE.md gotcha). Automatic routing must still never select `ultra`.

**MCP** (`src/mcp/`, 520 LOC; 4 subcommands at `src/cli.ts:135-160` = 30% of the command surface):
4. Collapse to two entry points: `kim mcp` (serves) and `kim mcp install [tool]` (covers today's install variants; uninstall becomes `kim mcp install --remove` or similar — check current subcommand semantics in `src/commands/mcp.ts` and preserve each capability under the smaller surface).
5. Move its README coverage (`README.md:297-308`) into `docs/` per Phase 5.

**Gate:** routing tests updated and passing; each old MCP capability reachable under the new surface (list the mapping in the commit message).

## Phase 7 — Delete hidden providers (small, breaking)

1. Delete `src/providers/catalog-hidden.ts` (172 LOC — Aider, Goose, Amp, Factory Droid, Cline).
2. Remove `supportLevel`/hidden machinery: `isHiddenCatalogEntry` / `isHiddenProviderName` (`src/providers/catalog.ts:29-34`) and all 4 filter sites (`catalog.ts:66`, `catalog.ts:148`, `src/setup/prompts.ts:57`, `src/setup/prompts.ts:86`); drop `supportLevel` from the entry type if nothing else uses it.
3. Delete `test/hidden-providers.test.ts`. Config normalization must **skip unknown provider names with a warning**, not crash, so a legacy config referencing `aider` still loads (add a test).
4. Scrub mentions from `CLAUDE.md` (it references hidden tools in several places), README, and `package.json` keywords if any.

**Gate:** grep for `aider|goose|amp|droid|cline|hidden` (case-insensitive) across `src/ test/ README.md CLAUDE.md` returns only intentional remnants (e.g. the legacy-config warning test).

## Phase 8 — Structural cleanup (medium)

1. **Merge the provider catalog into one data file.** `catalog-entries.ts` + `catalog-entries-continued.ts` (split only for the 250-LOC cap; order across files secretly drives the fallback chain). After Phase 7 removes the hidden file, merge into a single `catalog-entries.ts`. 👾 Also fixes the confirmed defect: the comment at `src/providers/catalog-entries-continued.ts:11-14` references `provider-catalog-data.ts`, which doesn't exist. **Add to CLAUDE.md conventions: pure data files are exempt from the 250-LOC cap.**
2. **Consolidate `src/harness/`** (14 files, 8 single-caller). Merge `attempt.ts` + `attempt-log.ts` + `observers.ts` + `io.ts` into `session.ts` or at most two files; fold `switch-menu.ts` (36 LOC) into its caller. ⚠️ Harness internals have no direct unit tests — refactor mechanically (move code, don't rewrite), lean on `test/harness-limits.test.ts` integration coverage, and re-run the three detection scenarios from the CLAUDE.md gotcha (prose mention → no switch; percentage warning flat + TUI-wrapped → no switch; real banner → switch).
3. **Fold single-file folders** (15 folders → ~11): `src/session/outcome.ts` is gone (Phase 6); move `session/log.ts` into `src/util/` or `src/config/`; move `src/routing/config.ts` (20 LOC, only exists to break an import cycle) into `src/config/`; move `src/probes/` (2 files, consumed only by harness) into `src/harness/`; consider `ui/restore.ts` → `ui/terminal.ts` if combined ≤ cap. Update the CLAUDE.md layout table.
4. **Kill the barrel.** `src/index.ts` (~60 exports) has zero consumers except its own tautological `test/index.test.ts`. Make the package bin-only: delete `src/index.ts` and `test/index.test.ts`, remove `main`/`types`/`exports` from `package.json` (keep `./package.json` export if anything needs it — check first).
5. **Rename the artifacts collision**: `src/handoff/artifacts.ts` (deletes files) vs `src/util/artifacts.ts` (writes a `.gitignore` marker) — rename one to say what it does (e.g. `handoff/cleanup.ts`, `util/gitignore-marker.ts`).
6. **De-duplicate `src/commands/`**: 8 of 9 commands repeat the same cwd-resolve + `loadConfig` + `catch → chalk.red → exitCode=1` shell (`clear.ts:32`, `handoff.ts:19`, `providers.ts:15`, `session.ts:64`, `doctor.ts:90`, `launch.ts:141`, …). Add a `withConfig(handler)` wrapper in `cli-options.ts`; tiny commands can collapse or move inline into `cli.ts`.

**Gate:** full `pnpm build && pnpm test && pnpm lint`; CLAUDE.md layout table matches reality.

## Phase 9 — Tests for the untested critical path (medium)

Detection is well covered; the **reaction** to detection is not. Add direct unit tests (one file per module, vitest, matching existing `test/<module>.test.ts` style) for, in priority order:

1. `src/handoff/artifacts.ts` (or its Phase-8 rename) — **destructive filesystem code with zero direct tests**. Cover `isSafeToRecursivelyDelete` guard rails against paths outside `.keepitmovin/`, symlinks, and root-ish paths. Use temp dirs, never the repo tree.
2. `src/harness/finalize.ts` — session log + handoff quality written after a switch.
3. `src/handoff/quality.ts` — `assessHandoffQuality` scoring.
4. `src/providers/health.ts` — currently only exercised indirectly via `runDoctor`.
5. `src/ui/restore.ts` — raw-mode/cursor recovery (user-visible failure mode).

**Gate:** each new test file passes; coverage of the five modules is direct, not incidental.

## Final checklist

- [ ] `pnpm build`, `pnpm test`, `pnpm lint` all green
- [ ] README, `docs/configuration.md`, CONTRIBUTING.md, CLAUDE.md, and `site/` pages consistent with the new behavior
- [ ] Legacy-config tolerance tests exist (deleted keys, removed provider names)
- [ ] The three failure-detection scenarios re-verified (see Phase 8.2)
- [ ] CHANGELOG.md entry drafted under an Unreleased v4.0.0 heading (do not release)
- [ ] Delete this `HANDOFF.md`
