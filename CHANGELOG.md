# Changelog

All notable changes to keepitmovin are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Optional Jev task routing via `routing.classifier: "jev"`. Sanitized task text is sent to
  TypeSafe only when `TYPESAFE_API_KEY` is present; requests time out after 2.5 seconds and silently
  fall back to the local classifier on any failure.

### Changed

- **The short command is now `movin`** (`movin`, `movin doctor`, `movin providers`, …). `kim`
  still works as an undocumented alias and will be removed in the next major version;
  `keepitmovin` remains the full name. Existing `kim mcp install` entries are unaffected — they
  call the CLI by path, not by command name.
- Plain `movin` stays prompt-free when routing is enabled; pass a task to route a session.
- The bin-only npm package no longer ships internal TypeScript source or declaration files.
- The start banner shows your configured `harness.manualSwitchKey` instead of always "Ctrl+]".
  The key must be one of `ctrl-]`, `ctrl-\`, `ctrl-g`, `ctrl-o` (case-insensitive); any other
  value falls back to `ctrl-]` as before.
- A bare `429` no longer counts as a rate limit — it has to read as an HTTP status (`HTTP 429`,
  `status: 429`, `API Error: 429`, `429 Too Many Requests`). Line numbers like `foo.ts:1429`,
  byte counts, and `line 429` used to force a switch.
- After a non-zero exit, only the transcript tail is substring-scanned for limit wording; older
  output must be a status line. Earlier prose about rate limits no longer turns an ordinary crash
  into `rate_limit`. Curated tool banners now also count after exit.
- `movin --tier` without a task warns that the tier was ignored.
- `movin mcp` prints a hint when started by hand in a terminal, and the MCP SDK is loaded only for
  `movin mcp`, so every other command starts faster.
- CI runs smoke checks on the built CLI (`--version`, `doctor` against the example config, an MCP
  handshake, `npm pack`), adds Node 26, and adds a macOS leg.
- The website no longer has a pricing section.
- New homepage hero and README GIF: Claude Code's usage meter fills, the handoff card carries the
  task to Codex, and the task bar never resets. Both come from one scene
  (`site/src/components/HandoffMeter.astro`); `demo/render-hero-gif.mjs` renders the GIF from it,
  replacing the VHS recording.

- **Four new tools: Pi, Factory Droid, Amp, and Qwen Code** (13 total). Pi follows opencode in
  the default fallback order; the others sit before Ollama. Existing configs pick them up at the end
  of their chain. Limit banners come from each tool's source (Pi, Qwen Code) or shipped binary
  (Droid, Amp). Qwen Code launches with `-i` because a bare prompt runs once and exits; Amp gets the
  handoff pasted after launch because it has no interactive prompt argument.
- Detection reads banners drawn inside TUI dialog borders (`│ Out of Credits │`) and treats Qwen
  Code's `✕` as an error marker. Markdown table rows (`| … |`) still never count as status lines.
- OpenAI's `insufficient_quota` error code is now recognized as a quota failure for every tool.
- `movin mcp install` sets up Pi (`~/.pi/agent/mcp.json`), Factory Droid (`~/.factory/mcp.json`),
  Amp (`amp.mcpServers` in `~/.config/amp/settings.json`), and Qwen Code (`~/.qwen/settings.json`).
- The website shows official logos for Pi, Factory Droid, Amp, and Qwen Code.

### Fixed

- `movin mcp install --status` reported tools that aren't installed as "ready" (the "command not
  found" error text contains "mcp"), and `install` then failed on them. They now show as missing.
- Ctrl-C left a 5-second SIGKILL timer running that could fire at an exited (possibly reused) pid.
  The escalation timer now clears itself when the tool exits.
- Tools are stopped with an explicit SIGTERM; node-pty's default was SIGHUP.
- Under the pipe fallback, a tool killed by an outside signal (OOM killer, `kill -9`) was recorded
  as a clean exit. It now counts as a failure.
- A pasted prompt that the tool echoed back re-wrapped could stay in the scanned output and trigger
  a switch on its own text; stripping now tolerates any whitespace between words.
- Compaction and stale-handoff nudges could be typed into a tool that had already been stopped.
- A half-written compaction record was skipped forever instead of re-read on the next poll.
- Closing the terminal (SIGHUP) now records the session as aborted.
- `movin doctor` reported the sessions folder next to the `-c` config file; sessions are written
  under the working directory.
- The docs said Ollama's model could be changed in `args`; built-in tools' arguments are fixed.
  The configuration docs now describe built-in vs. custom tools and `manualSwitchKey`.

## [4.0.0] — 2026-07-26

### Changed — BREAKING

- **`kim` no longer asks anything before starting.** It prints your fallback order and launches.
  `kim providers` (now with `--reset`) is the one way to change tools or order.
- **First-run setup asks one question instead of six.** It suggests a fallback order and offers a
  single optional reorder. Gone: three info panes, the Cline/OpenRouter question, the routing
  opt-in, and the per-slot ordering prompts.
- **`kim init` removed** — the default run and `kim providers` already create the config and
  folders. **`kim setup` is now a hidden alias of `kim providers`**; the two ran identical code.
- **Tool update checks are off by default.** Set `updates.checkOnStart` to `true` to opt in.
- **Eleven config options removed**, each fixed at its former default: `context.maxDiffChars`,
  `logs.sessionsDir`, `harness.transcriptLimitChars`, `harness.handoffPath`,
  `harness.handoffArchiveDir`, `harness.autoAppendCheckpoints`, `harness.watchdog.action`, the four
  `harness.handoffRefresh.nudge.*` fields, and the global `fallbackOn` (per-provider `fallbackOn`
  still works). Configs containing them still load; the removed keys are ignored.
  Artifact paths being constants also means a mis-set path can no longer aim `kim clear` at your
  own files.
- **Routing keeps only `--tier`.** `--model`, `--effort` and `--no-route` are gone, along with the
  mid-launch tier confirmation and the end-of-session "how did it go?" prompt. Routing config is a
  single `enabled` switch.
- **`kim mcp` now serves directly**; `kim mcp status` / `install` / `remove` become
  `kim mcp install --status` / `kim mcp install` / `kim mcp install --remove`. `kim mcp serve`
  still works, so existing MCP client configs keep running.
- **Unverified tools removed from the catalog**: Cline, Aider, Goose, Amp, Factory Droid and the
  OpenRouter gateway, plus the hidden-provider machinery behind them. A config naming one still
  loads — the entry is kept as your own command.
- **No public library API.** The package ships as a `bin`; `main`, `types` and the module exports
  are removed. Nothing imported them.

### Changed

- The README hero GIF is re-recorded against the prompt-free launch.

## [3.0.0] — 2026-07-26

### Changed — BREAKING

- **Requires Node.js 22.12 or newer** (was 20). Node 20 left active support in October 2025 and is
  security-only until April 2027. The bump unblocks commander 15 and execa 10, both of which
  require Node 22 — holding them back would have frozen those dependencies until 2027.
- **Removed `formatGitContext` and the `CompactionProbeKind` type from the public exports.** Neither
  was referenced anywhere, including at its own call site. Use `formatGitSnapshot` and
  `CompactionProbeSpec["kind"]`.
- `-c=value` is no longer accepted for the short `--config` flag. Commander treats `=` as a
  separator for long options only, so use `-c value`, `-cvalue`, or `--config=value`. This drops a
  hand-rolled argv scan that duplicated commander's parsing and mis-handled `-cvalue`.

### Added

- Handoff receipts: receiving tools restate the goal and next action; missing receipts warn after
  60 seconds and never stop the session.
- Structured Claude Code and Codex compaction recovery, with a refreshed handoff and same-tool
  reread prompt instead of an automatic switch.
- Warning-only loop, abnormal Codex burn, and streaming-stall watchdog signals recorded locally.
- A read-only local MCP server plus reversible user-wide installers for MCP-capable coding tools.
- `redactSecrets` now covers JWTs, inline URL credentials, and npm/HuggingFace/Groq/xAI/OpenRouter/
  Stripe/SendGrid tokens, plus a name-based catch-all for secret-shaped assignments.
- Public exports for `detectLiveFailure`, `redactSecrets`, `isSafeToRecursivelyDelete` and
  `assessHandoffQuality`.
- `./package.json` is now reachable through the package `exports` map, so tooling that reads it
  (bundlers, version checkers) no longer hits ERR_PACKAGE_PATH_NOT_EXPORTED.

- **Four new tools: Pi, Factory Droid, Amp, and Qwen Code** (13 total). Pi follows opencode in
  the default fallback order; the others sit before Ollama. Existing configs pick them up at the end
  of their chain. Limit banners come from each tool's source (Pi, Qwen Code) or shipped binary
  (Droid, Amp). Qwen Code launches with `-i` because a bare prompt runs once and exits; Amp gets the
  handoff pasted after launch because it has no interactive prompt argument.
- Detection reads banners drawn inside TUI dialog borders (`│ Out of Credits │`) and treats Qwen
  Code's `✕` as an error marker. Markdown table rows (`| … |`) still never count as status lines.
- OpenAI's `insufficient_quota` error code is now recognized as a quota failure for every tool.
- `movin mcp install` sets up Pi (`~/.pi/agent/mcp.json`), Factory Droid (`~/.factory/mcp.json`),
  Amp (`amp.mcpServers` in `~/.config/amp/settings.json`), and Qwen Code (`~/.qwen/settings.json`).
- The website shows official logos for Pi, Factory Droid, Amp, and Qwen Code.

### Fixed

- `movin mcp install --status` reported tools that aren't installed as "ready" (the "command not
  found" error text contains "mcp"), and `install` then failed on them. They now show as missing.

- **Ordinary agent prose no longer forces a handoff.** Status words were matched as bare
  substrings, so a line like *"if we hit the rate limit we should back off"* — or any line
  containing *"whitespace"* alongside a limit phrase — read as a real limit banner. Status words
  must now sit directly beside the matched pattern.
- **Real limit banners are no longer swallowed.** Claude Code renders *"Context left until
  auto-compact: 23%"* directly above its status output, and the percentage-warning guard used that
  previous line to veto the next one — hiding a genuine *"usage limit reached"* banner. A line
  carrying its own exhaustion word is now always judged on its own merits, and a banner that quotes
  its own percentage is no longer dismissed as a warning.
- Injected prompts are normalized to LF before being stripped from the transcript. PTY output is
  CRLF, so they were never actually removed — and because the handoff prompt embeds the error type
  verbatim, a tool echoing its own launch arguments could trigger an immediate re-switch.
- **Ctrl-C now ends the session and exits non-zero.** It was recorded as a clean exit, so
  keepitmovin went on to write checkpoints, archive the handoff, and log a successful session.
- Switches are capped at twice the provider count. With two tools configured, the switch menu
  auto-picks the only alternative, so a persistent failure ping-ponged between them forever.
- A tool that ignores `SIGTERM` is escalated to `SIGKILL` after 5s instead of wedging the session.
- The handoff file is written atomically. A concurrent reader — the next tool, `kim handoff`, or
  the MCP server — could previously observe it empty or half-written.
- stdin is paused during cleanup, so `kim` exits instead of hanging; a crash-path hook restores raw
  mode and the cursor.
- The pipe fallback waits for output to drain before reporting exit (the limit banner was often in
  the final chunk), reports the real signal instead of inventing exit code 1, and survives EPIPE.
- `getChangedFiles` parses renames and paths containing spaces correctly.
- Invalid config JSON reports the file path and parse detail instead of a bare `SyntaxError`.

### Security

- Pins `fast-uri` to `>=3.1.4` via a pnpm override, clearing a high-severity host-confusion
  advisory (GHSA-v2hh-gcrm-f6hx) reached through `@modelcontextprotocol/sdk > ajv`.
- MCP path containment resolves symlinks, so a handoff path pointing outside the project root
  through a symlinked directory is rejected rather than streamed to connected clients.
- Handoff files, session logs and the trust store are written `0600` in `0700` directories.

### Changed

- Site: upgraded Astro 5 -> 7, clearing high-severity reflected-XSS and host-header-SSRF
  advisories, and pinned `postcss >= 8.5.18` / `sharp >= 0.35.0`. The site audit reports no known
  vulnerabilities and is a blocking CI check again.
- `src/` is grouped into 13 domain folders (harness, providers, handoff, config, routing, mcp,
  setup, detection, probes, pty, session, ui, util) instead of 61 flat files distinguished by
  filename prefix. Internal only — the public entry points are unchanged.
- Builds with TypeScript 7 (the Go-native compiler): a full build drops from ~2.5s to ~0.3s.
  `@types/node` is pinned to ^22 to match the supported runtime, so typecheck cannot green-light a
  Node API that is missing on the version users actually run.
- Releases publish from CI on a tag push using npm trusted publishing (OIDC), with provenance and
  no stored npm token. `pnpm release` now tags and pushes; it no longer publishes directly.
- `exports` lists `types` before `import`, as condition order requires.
- The published package includes `CHANGELOG.md` and `src/` (so declaration maps resolve).

## [2.0.1] — 2026-07-18

- **Four new tools: Pi, Factory Droid, Amp, and Qwen Code** (13 total). Pi follows opencode in
  the default fallback order; the others sit before Ollama. Existing configs pick them up at the end
  of their chain. Limit banners come from each tool's source (Pi, Qwen Code) or shipped binary
  (Droid, Amp). Qwen Code launches with `-i` because a bare prompt runs once and exits; Amp gets the
  handoff pasted after launch because it has no interactive prompt argument.
- Detection reads banners drawn inside TUI dialog borders (`│ Out of Credits │`) and treats Qwen
  Code's `✕` as an error marker. Markdown table rows (`| … |`) still never count as status lines.
- OpenAI's `insufficient_quota` error code is now recognized as a quota failure for every tool.
- `movin mcp install` sets up Pi (`~/.pi/agent/mcp.json`), Factory Droid (`~/.factory/mcp.json`),
  Amp (`amp.mcpServers` in `~/.config/amp/settings.json`), and Qwen Code (`~/.qwen/settings.json`).
- The website shows official logos for Pi, Factory Droid, Amp, and Qwen Code.

### Fixed

- `movin mcp install --status` reported tools that aren't installed as "ready" (the "command not
  found" error text contains "mcp"), and `install` then failed on them. They now show as missing.

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

- **Four new tools: Pi, Factory Droid, Amp, and Qwen Code** (13 total). Pi follows opencode in
  the default fallback order; the others sit before Ollama. Existing configs pick them up at the end
  of their chain. Limit banners come from each tool's source (Pi, Qwen Code) or shipped binary
  (Droid, Amp). Qwen Code launches with `-i` because a bare prompt runs once and exits; Amp gets the
  handoff pasted after launch because it has no interactive prompt argument.
- Detection reads banners drawn inside TUI dialog borders (`│ Out of Credits │`) and treats Qwen
  Code's `✕` as an error marker. Markdown table rows (`| … |`) still never count as status lines.
- OpenAI's `insufficient_quota` error code is now recognized as a quota failure for every tool.
- `movin mcp install` sets up Pi (`~/.pi/agent/mcp.json`), Factory Droid (`~/.factory/mcp.json`),
  Amp (`amp.mcpServers` in `~/.config/amp/settings.json`), and Qwen Code (`~/.qwen/settings.json`).
- The website shows official logos for Pi, Factory Droid, Amp, and Qwen Code.

### Fixed

- `movin mcp install --status` reported tools that aren't installed as "ready" (the "command not
  found" error text contains "mcp"), and `install` then failed on them. They now show as missing.

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

- **Four new tools: Pi, Factory Droid, Amp, and Qwen Code** (13 total). Pi follows opencode in
  the default fallback order; the others sit before Ollama. Existing configs pick them up at the end
  of their chain. Limit banners come from each tool's source (Pi, Qwen Code) or shipped binary
  (Droid, Amp). Qwen Code launches with `-i` because a bare prompt runs once and exits; Amp gets the
  handoff pasted after launch because it has no interactive prompt argument.
- Detection reads banners drawn inside TUI dialog borders (`│ Out of Credits │`) and treats Qwen
  Code's `✕` as an error marker. Markdown table rows (`| … |`) still never count as status lines.
- OpenAI's `insufficient_quota` error code is now recognized as a quota failure for every tool.
- `movin mcp install` sets up Pi (`~/.pi/agent/mcp.json`), Factory Droid (`~/.factory/mcp.json`),
  Amp (`amp.mcpServers` in `~/.config/amp/settings.json`), and Qwen Code (`~/.qwen/settings.json`).
- The website shows official logos for Pi, Factory Droid, Amp, and Qwen Code.

### Fixed

- `movin mcp install --status` reported tools that aren't installed as "ready" (the "command not
  found" error text contains "mcp"), and `install` then failed on them. They now show as missing.

- Percentage usage warnings (e.g. "You've used 92% of your limit") are no longer treated as a
  limit-hit event.

## [1.3.0] — 2026-07-05

### Added

- Live handoff-file refresh and a leaner handoff format.

## [1.2.0] — 2026-07-05

### Added

- Per-tool usage checks that read a tool's own on-disk usage to switch before hitting the wall.

- **Four new tools: Pi, Factory Droid, Amp, and Qwen Code** (13 total). Pi follows opencode in
  the default fallback order; the others sit before Ollama. Existing configs pick them up at the end
  of their chain. Limit banners come from each tool's source (Pi, Qwen Code) or shipped binary
  (Droid, Amp). Qwen Code launches with `-i` because a bare prompt runs once and exits; Amp gets the
  handoff pasted after launch because it has no interactive prompt argument.
- Detection reads banners drawn inside TUI dialog borders (`│ Out of Credits │`) and treats Qwen
  Code's `✕` as an error marker. Markdown table rows (`| … |`) still never count as status lines.
- OpenAI's `insufficient_quota` error code is now recognized as a quota failure for every tool.
- `movin mcp install` sets up Pi (`~/.pi/agent/mcp.json`), Factory Droid (`~/.factory/mcp.json`),
  Amp (`amp.mcpServers` in `~/.config/amp/settings.json`), and Qwen Code (`~/.qwen/settings.json`).
- The website shows official logos for Pi, Factory Droid, Amp, and Qwen Code.

### Fixed

- `movin mcp install --status` reported tools that aren't installed as "ready" (the "command not
  found" error text contains "mcp"), and `install` then failed on them. They now show as missing.

- Pin pnpm in CI to fix a corepack/Node mismatch.

## [1.1.0] — 2026-07-04

### Added

- Config trust gate and other security hardening.
- Task-routing groundwork, session logging, and provider-management commands.
- Provider-specific limit-pattern detection.
- Migrated prompts to `@clack/prompts`.

### Changed

- Removed the non-interactive task mode; keepitmovin is the interactive session harness only.

[Unreleased]: https://github.com/garrettsiegel/keepitmovin/compare/v4.0.0...HEAD
[4.0.0]: https://github.com/garrettsiegel/keepitmovin/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/garrettsiegel/keepitmovin/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/garrettsiegel/keepitmovin/compare/v2.0.1...v2.1.0
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
