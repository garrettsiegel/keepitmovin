# Changelog

All notable changes to keepitmovin are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Handoff receipts: receiving tools restate the goal and next action; missing receipts warn after
  60 seconds and never stop the session.
- Structured Claude Code and Codex compaction recovery, with a refreshed handoff and same-tool
  reread prompt instead of an automatic switch.
- Warning-only loop, abnormal Codex burn, and streaming-stall watchdog signals recorded locally.
- A read-only local MCP server plus reversible user-wide installers for MCP-capable coding tools.

## [2.0.1] — 2026-07-18

### Fixed

- **node-pty is now loaded lazily**, so importing the harness never triggers the native module
  load. On a platform where node-pty isn't built, keepitmovin now degrades to the documented
  non-interactive pipe fallback (with a warning) instead of crashing on startup.
- Self-contained `tsconfig.json` (no longer extends an out-of-repo base), so the repo builds from
  a clean clone and in CI.
- De-flaked the handoff-refresh interval test (polls for the refresh instead of a fixed sleep).

## [2.0.0] — 2026-07-18

### Changed — BREAKING: renamed to keepitmovin

- **The project is now `keepitmovin`.** This is a breaking rename, hence the major version:
  - Command: `codepass` → **`kim`** (with `keepitmovin` as a full alias).
  - npm package: `codepass` → **`keepitmovin`** (`npm install -g keepitmovin`). The old `codepass`
    package is deprecated and points here.
  - Config file: `codepass.config.json` → **`keepitmovin.config.json`**.
  - Data directory: `.codepass/` → **`.keepitmovin/`**.
  - Env override: `CODEPASS_HOME` → **`KEEPITMOVIN_HOME`**.
  - **No automatic migration.** To upgrade from codepass: `npm install -g keepitmovin`, then run
    `kim` and go through setup once (or rename your `codepass.config.json` to
    `keepitmovin.config.json`). Your handoff/session history under the old `.codepass/` is not moved.

### Added

- **Nine fully-supported tools.** Kimi CLI (Moonshot) joins the catalog, and Google Antigravity,
  opencode, Grok Build, Cursor Agent, GitHub Copilot CLI, and Ollama are promoted to full support
  with curated limit detection — up from Claude Code and Codex alone. Ollama is the default
  local last resort for advice and planning when every cloud tool is blocked.
- Support tiers for catalog tools (`supportLevel`), so unverified tools can be hidden from setup
  and defaults without being removed.

### Changed

- Plain-language pass across the whole CLI, setup wizard, and README — one consistent vocabulary
  ("tool", "fallback order", "handoff file"), with the tool-switch notice reworded to a calm
  "Switching tools — your context is packed."
- Cline, Aider, Goose, Amp, Factory Droid, and the OpenRouter path are hidden pending the same
  limit-detection verification the supported tools have. Configs that already reference them keep
  working.

## [1.6.1] — 2026-07-17

### Fixed

- Preserve the executable permission on the published CLI so `kim` runs after a global install.

## [1.6.0] — 2026-07-17

### Added

- Detect "at capacity" / server-overload alerts as handoff-triggering limits.

## [1.5.0] — 2026-07-11

### Added

- Grok Build and Cursor Agent as launchable tools, plus deferred bootstrap-paste prompt transport.

## [1.4.0] — 2026-07-09

### Added

- Opt-in local task routing (model and reasoning-effort selection) with more reliable handoffs.

## [1.3.1] — 2026-07-07

### Fixed

- Percentage usage warnings (e.g. "You've used 92% of your limit") are no longer treated as a
  limit-hit event.

## [1.3.0] — 2026-07-05

### Added

- Live handoff-file refresh and a leaner handoff format.

## [1.2.0] — 2026-07-05

### Added

- Per-tool usage checks that read a tool's own on-disk usage to switch before hitting the wall.

### Fixed

- Pin pnpm in CI to fix a corepack/Node mismatch.

## [1.1.0] — 2026-07-04

### Added

- Config trust gate and other security hardening.
- Task-routing groundwork, session logging, and provider-management commands.
- Provider-specific limit-pattern detection.
- Migrated prompts to `@clack/prompts`.

### Changed

- Removed the non-interactive task mode; keepitmovin is the interactive session harness only.

[Unreleased]: https://github.com/garrettsiegel/keepitmovin/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/garrettsiegel/keepitmovin/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/garrettsiegel/keepitmovin/compare/v1.6.1...v2.0.0
[1.6.1]: https://github.com/garrettsiegel/keepitmovin/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/garrettsiegel/keepitmovin/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/garrettsiegel/keepitmovin/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/garrettsiegel/keepitmovin/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/garrettsiegel/keepitmovin/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/garrettsiegel/keepitmovin/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/garrettsiegel/keepitmovin/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/garrettsiegel/keepitmovin/releases/tag/v1.1.0
