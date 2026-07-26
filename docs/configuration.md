# Configuration reference

keepitmovin is designed to work with no config at all. Everything here is optional.

Settings live in `keepitmovin.config.json` in your project directory. `kim providers` writes it
for you; you only need to edit it by hand for the options below. Anything you leave out uses the
default, so keep your file short — see [`keepitmovin.config.example.json`](../keepitmovin.config.example.json).

## Fallback order

```json
{
  "harness": {
    "providerOrder": ["claude", "codex", "opencode"]
  }
}
```

The order keepitmovin tries your tools in. `kim providers` is the easier way to change it.

## Usage checks

Watching a tool's output only reacts *after* it prints a limit message. When a tool records its own
remaining usage on disk, keepitmovin can read it and switch *before* you hit the wall.

Today only **Codex** exposes this: it writes rolling session files under
`~/.codex/sessions/YYYY/MM/DD/` that include its current 5-hour and weekly usage percentages.
keepitmovin reads the newest one before launching Codex (skipping it if it's already spent) and
re-checks periodically while it runs. Claude Code has no equivalent local usage file today, so it
relies on watching the output.

Usage checks are read-only and fail safe: if a session file is missing, unreadable, or in an
unexpected shape, the check reports nothing and output-watching still covers that session.

Under `harness.usageProbe`:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch for all usage checks. |
| `thresholdPercent` | `95` | Switch when a tool's highest usage window reaches this percent. |
| `pollIntervalMs` | `30000` | How often to re-check while a tool runs. |

A single tool can override the threshold with its own `usageProbe.thresholdPercent` (e.g. set
Codex to `80` to switch earlier). Run `kim doctor` to see each tool's current 5-hour / weekly usage.

## The handoff file

`.keepitmovin/current/handoff.md` is the shared continuity layer between tools. Each tool owns the
narrative sections (Current Goal, Working State, Commands And Checks, Blockers, Next Step) and is
asked to keep them current as it works. keepitmovin maintains the rest:

- **Mechanical sections stay fresh automatically.** While a tool runs, keepitmovin rewrites the
  Changed Files and Repository Snapshot sections on a timer, so those are accurate even if the tool
  never updates them.
- **It stays lean.** Raw `git diff` output is never stored (run `git diff` yourself for the
  details); tool switches are one-line entries in a Switch History trimmed to the last 10; and only
  the most recent transcript excerpt is kept.
- **Stale-handoff nudge.** If the narrative sections go stale while the tool is clearly still
  working, keepitmovin types a short, visible reminder into the tool asking it to update the
  handoff. It only fires when the tool is idle, and never more than once per staleness window.

Under `harness.handoffRefresh`:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch for the whole refresh/nudge system. |
| `intervalMs` | `60000` | How often the mechanical sections are refreshed and staleness is checked. |

## Idle timeout

```json
{ "harness": { "idleTimeoutMs": 0 } }
```

`0` disables it. Set it to a number of milliseconds and keepitmovin pauses a tool that has produced
no output for that long — the escape hatch for a tool that wedges without printing anything
recognizable.

## Warning-only watchdog

keepitmovin warns when it sees three conservative signals: a substantial output block repeated three
times in five minutes, Codex usage burn rising more than five times above the session's baseline, or
output continuing for ten minutes without a project or handoff progress signal. These warnings are
local telemetry only — they never switch or stop a tool.

On by default; turn it off with `{ "harness": { "watchdog": { "enabled": false } } }`. Automatic
switching on these signals is deliberately not implemented until they have enough real-world
evidence to justify it.

## Which failures hand off

By default keepitmovin hands off on `rate_limit`, `quota_exceeded`, `auth_error`, `timeout`,
`command_not_found`, and `nonzero_exit`. Override it for one tool with a `fallbackOn` array on that
tool's entry under `harness.providers`.

## Tool updates

keepitmovin does **not** check your tools for updates by default — starting `kim` never blocks on
anything. Turn the check on and keepitmovin runs each tool's verified native updater when one exists
(`claude update`, `codex update`, `kimi upgrade`, `opencode upgrade`, `grok update`,
`agent update`), asking first. It never guesses an installer for a tool without a verified update
command — those show up as "add later" with setup guidance instead.

```json
{
  "updates": {
    "checkOnStart": true,
    "mode": "prompt",
    "includeDisabledProviders": false
  }
}
```

`"mode": "always"` runs updates without asking; `"mode": "off"` skips the check entirely.

## Task routing and model selection

Off by default. Turn it on with `{ "routing": { "enabled": true } }`. When enabled, `kim` asks for a
task if one wasn't given on the command line, classifies it locally, and picks a model and reasoning
effort within your saved fallback order. It never changes that order and never makes network calls
for routing.

```sh
kim "Investigate the intermittent auth failure"
kim --tier deep "Implement the approved plan"
```

| Tier | Claude Code | Codex | Typical work |
|---|---|---|---|
| `light` | Haiku / low | GPT-5.6 Luna / low | Mechanical edits and exact small changes |
| `standard` | Sonnet / medium | GPT-5.6 Terra / medium | Planned features, known repros, ordinary maintenance |
| `deep` | Opus / high | GPT-5.6 Sol / high | Architecture, investigation, security, migrations |
| `max` | Fable / max | GPT-5.6 Sol / max | Long-horizon or whole-repository work |

GPT-5.6 Codex models are selected only when they appear in the local Codex model cache. If a
preferred model isn't advertised there, keepitmovin falls back to a broadly available GPT-5.x model.
Automatic routing never selects `ultra`. `kim session` reports the chosen route and whether the
handoff narrative was updated.

`--tier` targets the first tool in your fallback order. If keepitmovin later hands off, the next tool
gets its normal tier mapping rather than a possibly incompatible model name from the first tool.

> Prompts passed through a tool's command-line prompt argument may be briefly visible to other local
> processes through the operating system's process list. Don't put credentials in task text.

## Read-only MCP continuity

`kim mcp` exposes the current sanitized handoff and up to ten recent session outcomes as MCP
resources and read-only tools. It never exposes raw transcript excerpts and provides no write,
shell, switch, or network operation. The active project comes from the MCP client's workspace roots,
falling back to the process working directory.

`kim mcp install` detects Claude Code, Codex, Cursor, current Kimi Code, Google Antigravity,
OpenCode, Grok Build, and GitHub Copilot CLI. It previews user-wide changes and asks once before
writing. Direct JSON edits get timestamped backups and atomic writes. Older Kimi releases are
reported as `upgrade_required`; Ollama is reported as `unsupported` because it is a model runner,
not an MCP client. keepitmovin never upgrades another tool on your behalf.

## Where things are saved

```txt
.keepitmovin/current/handoff.md   the live handoff file for the current session
.keepitmovin/handoffs/            archived handoffs from past sessions
.keepitmovin/sessions/            session summaries (start/end time, tools tried, changed files)
```

Run `kim clear` any time you want to wipe these.

> Handoff files and session logs capture task text, terminal output, and repository metadata, which
> can contain secrets. Treat them as sensitive. keepitmovin writes a `.keepitmovin/.gitignore` so
> these stay out of your repo, and best-effort redacts common credential formats before persisting
> them — but don't share them blindly.
