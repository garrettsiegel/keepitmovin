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

## T2 — Trim catalog to PLAN scope; add ollama & openrouter · **Sonnet**

PLAN.md targets exactly: claude code, codex, antigravity, opencode, openrouter, ollama, cline.

- [ ] In `src/provider-catalog.ts`, delete the entries for `gemini`, `github-copilot`, `cursor`,
      `devin`, `openhands`, `continue`, `roo-code`.
- [ ] Add an `ollama` entry following the exact shape of existing entries: local tool, no auth/login,
      interactive command `ollama run <model>` (make the model configurable via args), install note
      pointing at https://ollama.com/download, and a limitation note that "rate limits" don't apply —
      failures are usually the daemon not running (`connection refused`).
- [ ] Add an `openrouter` entry: it is an API gateway, not a CLI — model it like `cline`
      (disabled by default) with auth notes saying it is reached through opencode/cline model config
      with an `OPENROUTER_API_KEY`. Keep the existing Cline↔OpenRouter notes consistent.
- [ ] Update `test/provider-catalog.test.ts` for the new entry set, and
      `codepass.config.example.json` if it references removed tools.
- [ ] Check `src/setup.ts` and `src/doctor.ts` for hardcoded references to removed tools; fix any.
- [ ] Verify: build/test/lint pass; `pnpm --filter codepass dev providers` lists exactly the 7 tools.

## T3 — Per-provider rate-limit detection · **Opus**

PLAN.md: "For all of these tools, CodePass needs to know how to detect if the user has been rate
limited." Today `src/errors.ts` has one generic keyword list. **This is the riskiest task in the
plan** — read the Gotchas in CLAUDE.md first: broad patterns false-positive when an agent merely
*discusses* rate limits in prose, causing unwanted mid-session switches.

- [ ] Add an optional `limitPatterns: string[]` field to the catalog entry type in
      `src/provider-catalog.ts` and to the provider schema in `src/config.ts` (mirror in `types.ts`),
      flowing through `mergeCatalogInteractiveProviders`.
- [ ] Seed provider-specific patterns in the catalog — prefer exact banner strings over generic words:
      - claude: `"5-hour limit reached"`, `"usage limit reached"`, `"/upgrade to increase"` -style banners
      - codex: `"you've hit your usage limit"`, `"usage limit"` banner variants
      - antigravity / opencode / cline: research their actual limit banners; if unverifiable, leave
        empty and note it in the catalog entry's `limitation` field
      - ollama: `"connection refused"` (daemon down — treat as provider failure, not rate limit)
- [ ] In `detectFallbackError` in `src/harness.ts`, match the active provider's `limitPatterns`
      **in addition to** the generic `LIMIT_PATTERN_GROUPS` from `src/errors.ts`. Keep the existing
      scoping/indicator logic that guards against prose mentions (see comment near harness.ts:212).
- [ ] Tests in `test/harness.test.ts` / `test/errors.test.ts`, both directions:
      (a) transcript where the agent *talks about* rate limits in prose → **no switch**;
      (b) a real provider banner (per-provider pattern) → **switch**.
- [ ] Verify: build/test/lint pass. Manually sanity-check by running the harness and pasting a limit
      phrase into normal agent prose — it must not trigger a switch.

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
