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

Both must pass:

```sh
pnpm build   # tsc -> dist/
pnpm lint    # tsc --noEmit
```

Manually exercise the behavior you changed and describe the check in your PR.

Please:

- Keep changes focused and leave a small, repeatable manual check for new behavior.
- Keep source files under ~250 lines — split a module rather than growing one.
- Match the surrounding code style (ESM with explicit `.js` import specifiers, `module`/
  `moduleResolution` NodeNext).
- Update the README, `CHANGELOG.md` (under `## [Unreleased]`), and inline docs when behavior
  changes.

## Adding or updating a tool

Every tool keepitmovin knows about is defined in one place — the provider catalog:

- `src/providers/catalog-entries.ts` — every tool, in one list.
- `src/providers/catalog-types.ts` — the entry shape.

To add a tool, add one `ProviderCatalogEntry`. Everything downstream (setup wizard, `doctor`,
updates, config defaults) reads the catalog, so no other wiring is needed. **Position matters**:
catalog order is the default fallback chain, so put the entry where it belongs in that sequence.

**"Full support" means the tool's real limit messages are detected.** A tool is only reliable in a
fallback order if keepitmovin can recognize when it's blocked. So a fully-supported entry needs a
curated `limitPatterns` list — the exact banner strings the tool prints when it hits a usage limit,
researched from the tool's **source code, GitHub issues, or official docs**. Do not invent
plausible-looking strings; if you can't confirm a banner from a primary source, say so in a code
comment and leave the tool relying on generic detection rather than adding it.

Manually verify each new pattern against all three cases:

1. An agent merely *discussing* a limit in prose → no switch.
2. A percentage usage warning → no switch.
3. The real limit banner on a status-like line → switch.

The failure-detection rules are subtle — read the **Gotchas** section of
[CLAUDE.md](./CLAUDE.md) before touching detection code.

## Releasing

`pnpm release <patch|minor|major|<semver>>` runs build/lint, bumps the version, commits and
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

Use the issue templates. For bugs, include your OS, `movin --version`, which tool was running,
and the exact terminal output (redact anything sensitive). Handoff files and session logs under
`.keepitmovin/` can contain secrets — don't paste them without checking.

## Security

Report suspected vulnerabilities through a
[private GitHub advisory](https://github.com/garrettsiegel/keepitmovin/security/advisories/new),
not a public issue.
