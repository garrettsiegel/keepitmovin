# Contributing to keepitmovin

Thanks for helping make keepitmovin better. It's a small TypeScript CLI, so the loop is quick.

## Getting set up

You need Node 22.12+ and [pnpm](https://pnpm.io) 10.23.0 (via corepack: `corepack enable`).

```sh
git clone https://github.com/garrettsiegel/keepitmovin.git
cd keepitmovin
pnpm install
pnpm build
```

Run the CLI without building:

```sh
pnpm dev              # runs src/cli.ts with tsx
pnpm dev -- doctor    # pass args to a specific command
```

## Before you open a PR

All three must pass:

```sh
pnpm build   # tsc -> dist/
pnpm test    # vitest
pnpm lint    # tsc --noEmit
```

Please:

- Keep changes focused and add tests for new behavior.
- Keep source files under ~250 lines — split a module rather than growing one.
- Match the surrounding code style (ESM with explicit `.js` import specifiers, `module`/
  `moduleResolution` NodeNext).
- Update the README, `CHANGELOG.md` (under `## [Unreleased]`), and inline docs when behavior
  changes.

## Adding or updating a tool

Every tool keepitmovin knows about is defined in one place — the provider catalog:

- `src/provider-catalog-data.ts` and `src/provider-catalog-more.ts` — the fully-supported tools.
- `src/provider-catalog-extra.ts` — hidden tools (kept in the catalog, off by default).
- `src/provider-catalog-types.ts` — the entry shape.

To add a tool, add one `ProviderCatalogEntry`. Everything downstream (setup wizard, `doctor`,
updates, config defaults) reads the catalog, so no other wiring is needed.

**"Full support" means the tool's real limit messages are detected.** A tool is only reliable in a
fallback order if keepitmovin can recognize when it's blocked. So a fully-supported entry needs a
curated `limitPatterns` list — the exact banner strings the tool prints when it hits a usage limit,
researched from the tool's **source code, GitHub issues, or official docs**. Do not invent
plausible-looking strings; if you can't confirm a banner from a primary source, say so in a code
comment and leave the tool relying on generic detection (or hidden).

Each new pattern needs a test proving all three cases (see `test/failure-detection.test.ts`):

1. An agent merely *discussing* a limit in prose → no switch.
2. A percentage usage warning → no switch.
3. The real limit banner on a status-like line → switch.

The failure-detection rules are subtle — read the **Gotchas** section of
[CLAUDE.md](./CLAUDE.md) before touching detection code.

## Releasing

`pnpm release <patch|minor|major|<semver>>` runs build/test/lint, bumps the version, commits and
tags it, and pushes `main` + tags to origin. Pushing the tag triggers the release workflow, which
rebuilds from a clean checkout and publishes to npm with provenance — nothing is published from a
laptop. CI authenticates with npm trusted publishing (OIDC), so no npm token is stored in this repo.

The script refuses to run from a branch other than `main`, with a dirty working tree, or out of sync
with `origin/main`, and prompts before it pushes (`--yes` skips the prompt). Preview everything,
including the packed npm contents, with no git or npm mutation:

```sh
pnpm release patch --dry-run
```

## Reporting bugs and requesting features

Use the issue templates. For bugs, include your OS, `kim --version`, which tool was running,
and the exact terminal output (redact anything sensitive). Handoff files and session logs under
`.keepitmovin/` can contain secrets — don't paste them without checking.

## Security

Please report suspected vulnerabilities privately per [SECURITY.md](./SECURITY.md) rather than in a
public issue.

## Code of conduct

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
