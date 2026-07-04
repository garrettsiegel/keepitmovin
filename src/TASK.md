# TASK.md — CodePass V1 Work Order

This is the execution plan to take CodePass from its current state to a solid V1, derived from
[PLAN.md](../PLAN.md). Tasks are ordered — **do them top to bottom**, because early tasks shrink
files that later tasks refactor. Each task names the model best suited to it: **Opus** for tasks
that cut across the config contract, detection logic, or carry regression risk; **Sonnet** for
mechanical, pattern-following, or copy/docs work.

## Ground Rules (read before every task)

- V1 is the **interactive harness only**. Task mode is being removed (T1).
- Files stay **≤ 250 LOC**, no nested functions, junior-readable, concise comments only where useful.
- ESM throughout: explicit `.js` import specifiers.
- The zod schema in `src/config.ts` is the config contract; `src/types.ts` mirrors it.
- `src/provider-catalog.ts` is the single source of truth for tool details — never scatter provider
  info across files.
- After **every** task, from the monorepo root:
  ```sh
  ~/Library/pnpm/pnpm --filter codepass build
  ~/Library/pnpm/pnpm --filter codepass test
  ~/Library/pnpm/pnpm --filter codepass lint
  ```
  All three must pass before checking the task off. After the final task also run root `pnpm build`.
- Record structural decisions (e.g. task-mode removal) in the **Notable Decisions & Lessons**
  section of the root `AGENTS.md`.
- Check off boxes in this file as you complete them.

---

## T1 — Remove task mode · **Opus** ✅ DONE

PLAN.md describes only the interactive harness; the non-interactive `codepass run "task"` mode is
legacy. Removing it touched the config contract, the barrel, and CLI wiring. Actual blast radius was
larger than first written — task mode also pulled in `prompt.ts`, `handoff.ts`, `context.ts`, and
`logger.ts` (all task-only; distinct from the harness's `handoff-file.ts`).

- [x] Deleted `src/run.ts`, `src/provider.ts`, `src/prompt.ts`, `src/handoff.ts`, `src/context.ts`,
      `src/logger.ts` and tests `test/run.test.ts`, `test/prompt.test.ts`, `test/handoff.test.ts`.
- [x] Removed the `run` command block from `src/cli.ts` plus its `runCodePass`/`RunAttemptLog`
      imports and the orphaned `formatAttempt`/`parseMaxRetries` helpers; simplified `normalizeArgv`
      (no longer reroutes bare args to `run`; bare `codepass` launches the harness).
- [x] Removed task-mode exports + types from `src/index.ts`.
- [x] `src/config.ts`: removed `providerConfigSchema`, the top-level `providers` array, `maxRetries`,
      the whole `git` section, and the unused `context` sub-flags / `logs.fullProviderOutput`; kept
      top-level `fallbackOn` (harness uses it) and `context.maxDiffChars`. `defaultConfig()` now
      parses `{}`. Dropped the now-dead `DEFAULT_TIMEOUT_MS`.
- [x] `src/types.ts`: removed `ProviderConfig`, `TaskContext`, `AttemptSummary`, `ProviderResult`,
      `ProviderRunOptions`, `RunOptions`, `RunAttemptLog`, `RunLog`, `RunSummary`.
- [x] `src/provider-catalog.ts`: removed `getDefaultTaskProviders` + `ProviderConfig` import
      (`taskArgs` entry fields left for T2).
- [x] `src/doctor.ts`: dropped the redundant task-mode `providerHealth`/`readyProviderCount`
      (now uses `interactiveProviderHealth`/`readyInteractiveProviderCount` from `harness.providers`);
      updated the CLI doctor renderer accordingly.
- [x] `src/git.ts`: removed the task-only `createCheckpointCommit` (kept `execa`, still used by `runGit`).
- [x] Updated `codepass.config.example.json` (dropped removed sections; trimmed harness providers to
      the real catalog set: claude, codex, cline, antigravity, opencode).
- [x] Updated `test/config.test.ts`, `test/doctor.test.ts`, `test/provider-catalog.test.ts`. Also
      fixed two PRE-EXISTING failures in the initial commit (tests referenced `aider/goose/kiro/amp`,
      which were never in the catalog) so the suite is green.
- [x] `execa` kept (used by doctor/setup/updates/git). Verified: build, lint, and 46/46 tests pass;
      `dev doctor` reports 4 ready harness providers. Notable Decisions entry added to root `AGENTS.md`.

## T2 — Trim catalog to PLAN scope; add ollama & openrouter · **Sonnet** ✅ DONE

PLAN.md targets exactly: claude code, codex, antigravity, opencode, openrouter, ollama, cline.

- [x] Deleted the `gemini`, `github-copilot`, `cursor`, `devin`, `openhands`, `continue`, `roo-code`
      entries from `src/provider-catalog.ts` (the gemini entry was the only `deprecated`-flagged one;
      removing it makes that migration path in `mergeCatalogInteractiveProviders` currently unused
      but still generically correct for any future deprecated entry).
- [x] Added `ollama`: harness group, `pty_with_bootstrap_input`, `disabledEnabled: false` (parallels
      `cline` — not everyone has it installed/pulled a model), command `ollama run llama3.2` with the
      handoff pasted in via bootstrap input (same pattern as `antigravity`). `limitation` documents
      that it's a plain chat REPL (no autonomous file edits) and that failures are usually the daemon
      being down (`connection refused`), not a rate limit — feeds directly into T3.
- [x] Added `openrouter`: guided group, `external_app`, `controllable: false` — it's a model gateway
      reached through opencode/Cline config, not a launchable CLI, so it's not offered in the harness
      stack picker (verified live: only `ollama`/`cline`/etc. appear as selectable stack tools).
- [x] Updated `test/provider-catalog.test.ts` (full catalog list, guided/harness-controllability
      tests, new ollama-defaults test, removed the dead gemini-deprecation test),
      `test/doctor.test.ts` and `test/setup.test.ts` (catalog assertions referencing removed tools).
      `codepass.config.example.json` needed no change (never referenced the removed tools).
- [x] Checked `src/setup.ts`/`src/doctor.ts` for hardcoded refs to removed tools — none found.
- [x] Verified: build/lint/test all pass (46/46); `dev providers` lists exactly claude, codex,
      antigravity, opencode, ollama as selectable harness tools + cline (disabled), matching PLAN.md's
      7-tool scope; `dev doctor --all` shows `ollama` under the catalog with a live "daemon not
      running" warning (confirms the doctor version-check path works for it) and `openrouter` as a
      guided setup-guide row.

## T3 — Per-provider rate-limit detection · **Opus** ✅ DONE

PLAN.md: "For all of these tools, CodePass needs to know how to detect if the user has been rate
limited." `src/errors.ts` had one generic keyword list. This was the riskiest task — the CLAUDE.md
gotcha is that broad patterns false-positive on prose. The live detector already had a solid prose
guard (`isStatusLikeLine` gating in `harness.ts:detectLiveFailure`); T3 layered per-provider banners
on top of it without weakening that guard.

- [x] Added optional `limitPatterns?: string[]` to the catalog entry type + `catalogEntryToInteractiveProvider`
      (`provider-catalog.ts`), the `interactiveProviderConfigSchema` (`config.ts`), and
      `InteractiveProviderConfig` (`types.ts`). Propagated through `mergeCatalogInteractiveProviders`
      so saved configs re-hydrate the catalog's patterns (verified: a saved claude/codex config with
      no `limitPatterns` gets them back on merge).
- [x] Seeded `claude` (`"5-hour limit reached"`, `"upgrade to increase your usage limit"`,
      `"you've reached your usage limit"`) and `codex` (`"you've hit your usage limit"` + variants).
      Left antigravity/opencode/cline/ollama empty — their exact banners aren't verified here, and
      the generic detector already covers the common families. Noted this in the antigravity/opencode
      `limitation` fields. Did **not** add ollama `"connection refused"`: that's a daemon-down failure,
      not a rate limit, and it surfaces as a non-zero exit handled by `detectExitFailure` — misfiling
      it as `rate_limit` would be wrong.
- [x] **Design decision (key):** generic patterns stay gated by `isStatusLikeLine` (the prose guard);
      a provider's curated `limitPatterns` are exact, maintainer-vouched banners, so they're trusted on
      a *direct* substring match (new `matchProviderLimitPattern` in `errors.ts`). This is what makes
      the feature add value — it catches distinctive banners (e.g. `"you are out of credits"`) that the
      generic status-line heuristic would filter out. A provider match classifies as `rate_limit` and
      still respects `fallbackOn`.
- [x] Tests both directions: `test/harness.test.ts` — (a) a provider banner the generic patterns would
      miss → **switch**; (b) provider has `limitPatterns` but the agent discusses limits in prose
      (rate limit / 429) → **no switch** (guard intact); (c) banner present but `rate_limit` excluded
      from that provider's `fallbackOn` → **no switch**. Plus `matchProviderLimitPattern` unit tests in
      `test/errors.test.ts` and a catalog-propagation test. 53 tests pass.
- [x] Verify: build/lint/test all green. Updated the CLAUDE.md detection gotcha to describe the two
      detection layers.

## T4 — Single prompt library: migrate @inquirer → clack · **Sonnet**

PLAN.md says the CLI should use clack. Both `@clack/prompts` and `@inquirer/prompts` are installed;
inquirer is used in `src/switch-menu.ts` and `src/cli.ts`.

- [ ] Rewrite the provider select in `src/switch-menu.ts` using `@clack/prompts` `select`
      (handle cancel via `isCancel`, matching how `src/setup.ts` already does it — copy that idiom).
- [ ] Replace the inquirer `confirm` usage in `src/cli.ts` (the `clear` command's `--yes` bypass path)
      with clack `confirm`.
- [ ] Remove `@inquirer/prompts` from `package.json`; run `~/Library/pnpm/pnpm install` to update the
      lockfile.
- [ ] Update `test/prompt.test.ts` / any test that stubs inquirer.
- [ ] Verify: build/test/lint pass; `pnpm --filter codepass dev clear` prompts and cancels cleanly;
      manual switch (Ctrl+]) shows the clack menu.

## T5 — "Commercial break" switch interstitial · **Sonnet**

PLAN.md wants a short, fun "commercial break" message while CodePass swaps tools. Pure UX copy —
no logic changes.

- [ ] Add a small interstitial renderer in `src/terminal-ui.ts` (keep the file ≤250 LOC): a boxed
      2–3 line message shown between provider exit and next provider launch, e.g.
      `☕ Quick break! claude hit its limit — moving you into codex, handoff in hand…`
      Vary copy by reason: rate limit vs. manual switch. Reuse the existing chalk styling in that file.
- [ ] Call it from the switch path in `src/harness.ts` (where the handoff banner currently prints).
- [ ] Keep it to one short paragraph — no delays/sleeps, no animation; the user is mid-flow.
- [ ] Add/extend a `test/terminal-ui.test.ts` case for the new renderer.
- [ ] Verify: build/test/lint pass; trigger a manual switch and confirm the message shows once,
      before the new tool's intro prompt.

## T6 — LOC-limit refactor (≤250 LOC per file) · **Opus for harness.ts; Sonnet for the rest**

Pure extraction — **zero behavior change, tests pass unchanged** (only import paths in tests may
move). Do this after T1–T5 so you split the final shapes of these files.

- [ ] **(Opus)** `src/harness.ts` (~590): extract failure-detection (`detectFallbackError` + pattern
      scoping + `MANUAL_SWITCH_SEQUENCES`) into `src/failure-detection.ts`, and PTY session
      spawn/wiring into `src/harness-session.ts`. `harness.ts` keeps the orchestration loop.
- [ ] **(Sonnet)** `src/cli.ts` (~450 after T1): move each command's action body into
      `src/commands/<name>.ts` (init, doctor, handoff, clear, setup, providers, session);
      `cli.ts` keeps only commander wiring + shared option parsing.
- [ ] **(Sonnet)** `src/setup.ts` (~400): extract the auth/login step and the version-check step into
      focused modules (e.g. `src/setup-auth.ts`, `src/setup-updates.ts`).
- [ ] **(Sonnet)** Re-check `src/provider-catalog.ts`, `src/doctor.ts`, `src/updates.ts` after
      T1/T2 — split only those still > 250 LOC.
- [ ] Keep `src/index.ts` exports intentional — do not re-export new internal modules unless needed.
- [ ] Verify: `wc -l src/*.ts src/**/*.ts` shows every file ≤ 250 (flag any justified exception in
      the PR/summary); build/test/lint pass; quick manual harness run still works.

## T7 — npm publish prep · **Sonnet**

PLAN.md installs via `npm i codepass`. Prep the package; **do not actually publish** — that stays a
manual step for Garrett.

- [ ] In `package.json`: remove `"private": true`; set `"version": "1.0.0"`; add
      `"files": ["dist", "README.md"]`, `"license"`, `"repository"`, `"keywords"`,
      `"engines": { "node": ">=20" }`, and `"prepublishOnly": "pnpm build"`.
- [ ] Confirm `bin`/`main`/`types`/`exports` still point at real `dist/` files after T6's splits.
- [ ] Run `npm pack --dry-run` and check the file list: dist + README only, no src/tests/config
      examples unless intended.
- [ ] Check the name `codepass` is available on npm (`npm view codepass`); if taken, flag it for
      Garrett rather than renaming unilaterally.
- [ ] Verify: build/test/lint pass; `node dist/cli.js --help` works from a clean build.

## T8 — Docs refresh · **Sonnet** (last — docs must describe reality)

- [ ] `README.md`: update the commands section (no `run`), the provider list/table (the 7 V1 tools
      incl. ollama/openrouter), install instructions (`npm i -g codepass` → `codepass`), the switch
      key + commercial-break behavior, handoff storage location and the `clear` command. Keep it
      simple enough for non-devs, per PLAN.md.
- [ ] `CLAUDE.md` (this package): remove task-mode rows/sections (run.ts, provider.ts), update the
      module table for T6's new files, keep the gotchas (update the detection gotcha to mention
      per-provider `limitPatterns`).
- [ ] Skim `HARNESS_VISION.md` and `POPULAR_TOOLS.md`: fix anything that now contradicts V1
      (e.g. task mode, removed catalog tools). Trim rather than rewrite.
- [ ] In the handoff template (`src/handoff-file.ts`), tighten the instructions the agent receives:
      add an explicit size cap ("keep this file under ~150 lines") and "revise sections in place —
      don't append a log". This is the token-minimal handoff strategy PLAN.md asks about: the active
      agent maintains the file as a side effect of normal work; CodePass makes no extra model calls.
- [ ] Delete `PLAN.md`'s completed concerns? **No** — leave PLAN.md untouched; it's the product brief.
- [ ] Verify: build/test/lint pass; root `pnpm build` passes; delete this `TASK.md` once every box
      above is checked and Garrett confirms V1.

---

## Definition of Done (V1)

- [ ] T1–T8 complete, all checkboxes ticked.
- [ ] `build`, `test`, `lint` green for the package; root `pnpm build` green.
- [ ] Fresh-terminal smoke test: `codepass` → wizard (or "use previous settings") → provider launches
      → Ctrl+] manual switch shows the interstitial and moves to the next tool with the handoff.
- [ ] Every `src` file ≤ 250 LOC; single prompt library (clack); no task-mode remnants.
- [ ] `npm pack --dry-run` clean; publish left for Garrett.
- [ ] README.md and CLAUDE.md match actual behavior.
