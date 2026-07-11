# CodePass

![CodePass automatically hands off from a rate-limited Claude Code to Codex, mid-task](https://raw.githubusercontent.com/garrettsiegel/codepass/main/public/codepass-demo.gif)

**CodePass is a terminal harness that lets you switch between AI coding agents — Claude Code,
Codex, Antigravity, opencode, Grok Build, Cursor Agent, Aider, Goose, Amp, Factory Droid,
GitHub Copilot CLI, Cline, Ollama — without losing your place.**

If you've ever been deep in a task in Claude Code and hit your 5-hour rate limit, or realized
partway through that Codex would handle the next part better, you know the problem: switching
tools means starting over. The new tool has no idea what you were doing.

CodePass fixes that. It runs your coding tool inside one terminal session, watches for rate
limits and failures, and when it's time to switch, it automatically writes a shared "handoff"
file — your goal, what's changed, what's blocked, what's next — and hands it to the next tool so
you can pick up exactly where you left off.

```sh
codepass
```

That's the whole interface. CodePass walks you through setup the first time, then starts your
first tool. If it hits a limit, CodePass shows a quick "commercial break" message and switches for
you.

```txt
Claude Code -> Codex -> Google Antigravity -> opencode -> Grok Build -> Cursor Agent -> Cline with OpenRouter later
```

## Who this is for

Anyone who codes with an AI terminal agent and has more than one tool available — whether that's
because you hit rate limits, want to compare tools, or just like having a fallback chain instead
of being stuck when one tool goes down. No programming experience is required to use CodePass
itself; you only need one of the supported coding tools already set up.

## Install

```sh
npm install -g codepass
codepass
```

Or run it without installing anything:

```sh
npx codepass
```

On first run, CodePass starts a guided setup wizard: it detects which tools you have installed and
lets you pick which ones to use and in what order.

## The Important Limitation

CodePass cannot copy a tool's private live chat/session state into another tool unless that tool
exposes a supported API for it — no coding agent currently does this reliably. So instead of
pretending to transfer your conversation, CodePass preserves *practical* continuity with a live
handoff file:

- `.codepass/current/handoff.md` — the shared file every tool reads and updates
- current working directory
- git status, diff statistics, and changed filenames
- changed files
- project instructions like `AGENTS.md`
- terminal transcript excerpts
- the reason the switch happened
- a generated handoff prompt for the next tool

The active tool is instructed to keep this file updated as it works — CodePass doesn't make any
extra AI calls to do this, so it costs you nothing beyond what the tool would already use.

> **Note:** Handoff files and session logs under `.codepass/` capture task text, terminal output,
> and repository metadata, which can contain secrets. Treat them as sensitive. CodePass
> writes a `.codepass/.gitignore` so these artifacts stay out of your repo, and best-effort
> redacts common credential formats before persisting them — but don't share them blindly.

## How It Works

1. CodePass loads `codepass.config.json` (or built-in defaults if none exists yet).
2. First run: CodePass asks which tools you want, in what order. Later runs: CodePass shows your
   saved chain and asks whether to launch it, reconfigure it, or start fresh.
3. CodePass launches the first enabled tool in a real pseudo-terminal — it looks and feels exactly
   like running that tool directly.
4. CodePass creates `.codepass/current/handoff.md` and tells the active tool to keep it updated.
5. Your terminal input/output is mirrored straight through, so the tool stays fully interactive.
6. If output looks like a rate limit, quota issue, auth failure, or another recognizable failure —
   or a usage probe reports the tool is near its limit (see below) — CodePass pauses that tool.
7. CodePass appends a checkpoint to the handoff file, shows a short "commercial break" message
   explaining what happened, and launches the next tool with the handoff already loaded.
8. CodePass writes a session summary and archives the handoff for the record.

You can also switch manually at any time:

```txt
Ctrl+]
```

Press this while a tool is running to ask CodePass to switch tools right now — useful if you just
want a different tool's take on something, not only when a limit hits.

### Usage Probes

Keyword detection only reacts *after* a tool prints a limit banner. When a tool records its own
remaining usage on disk, CodePass can read it and switch *before* the wall — a **usage probe**.

Today only **Codex** exposes this: it writes rolling session files under
`~/.codex/sessions/YYYY/MM/DD/` that include its current 5-hour and weekly usage percentages.
CodePass checks the newest of these once before launching Codex (skipping it if it's already
exhausted) and periodically while it runs. Claude Code has no equivalent local usage file today, so
it relies on keyword detection.

Probes are read-only and fail safe: if a session file is missing, unreadable, or in an unexpected
shape, the probe simply reports nothing and keyword detection still covers that session.

Configure it under `harness.usageProbe` in `codepass.config.json`:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch for all usage probes. |
| `thresholdPercent` | `95` | Switch when a tool's highest usage window reaches this percent. |
| `pollIntervalMs` | `30000` | How often to re-check while a tool runs. |

A single provider can override the threshold with a per-provider
`usageProbe.thresholdPercent` (e.g. set Codex to `80` to switch earlier). Run `codepass doctor` to
see each probed provider's current 5-hour / weekly usage.

### Task Routing And Model Selection

Task routing is opt-in during setup. When enabled, `codepass` asks for a task if one was not
provided on the command line, classifies it locally, and selects a model and reasoning effort
within your saved provider order. It never changes that order or makes network calls for routing.

```sh
codepass "Investigate the intermittent auth failure"
codepass --tier deep "Implement the approved plan"
codepass --model gpt-5.6-sol --effort high "Review the payment migration"
codepass --no-route "Use the provider defaults for this task"
```

| Tier | Claude Code | Codex | Typical work |
|---|---|---|---|
| `light` | Haiku / low | GPT-5.6 Luna / low | Mechanical edits and exact small changes |
| `standard` | Sonnet / medium | GPT-5.6 Terra / medium | Planned features, known repros, ordinary maintenance |
| `deep` | Opus / high | GPT-5.6 Sol / high | Architecture, investigation, security, migrations |
| `max` | Fable / max | GPT-5.6 Sol / max | Long-horizon or whole-repository work |

GPT-5.6 Codex models are selected only when they appear in the local Codex model cache. If a
preferred model is not advertised there, CodePass falls back to a broadly available GPT-5.x
model. Automatic routing never selects `ultra`; pass `--effort ultra` explicitly when the selected
Codex model advertises support. `codepass session` reports the chosen route, the explicit task
outcome, and whether the handoff narrative was updated.

`--model` and `--effort` target the first provider in the saved chain. If CodePass later hands off,
the fallback provider receives its normal tier mapping rather than a possibly incompatible model
name from the first tool.

Prompts passed through a provider's command-line prompt argument may be briefly visible to other
local processes through the operating system's process list. Do not put credentials in task text.

### The Handoff File

`.codepass/current/handoff.md` is the shared continuity layer between tools. Each tool owns the
narrative sections (Current Goal, Working State, Commands And Checks, Blockers, Next Step) and is
asked to keep them current as it works. CodePass maintains the rest:

- **Mechanical sections stay fresh automatically.** While a tool runs, CodePass rewrites the
  Changed Files and Repository Snapshot sections on a timer, so those are accurate even if the tool
  never updates them.
- **It stays lean.** Raw `git diff` output is never stored (run `git diff` yourself for the
  details); tool switches are one-line entries in a Switch History that's trimmed to the last 10;
  and only the most recent transcript excerpt is kept.
- **Stale-handoff nudge.** If the narrative sections go stale while the tool is clearly still
  working, CodePass types a short, visible reminder into the tool asking it to update the handoff.
  It only fires when the tool is idle, and never more than once per staleness window.

Configure it under `harness.handoffRefresh` in `codepass.config.json`:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch for the whole refresh/nudge system. |
| `intervalMs` | `60000` | How often CodePass refreshes the mechanical sections and checks for staleness. |
| `nudge.enabled` | `true` | Whether to type the stale-handoff reminder into the tool. Set `false` to disable nudges. |
| `nudge.staleAfterMs` | `300000` | How long the narrative can go unchanged before it's considered stale. |
| `nudge.idleForMs` | `10000` | The tool must be idle at least this long before a nudge is sent. |
| `nudge.minTranscriptGrowthChars` | `2000` | How much output the tool must produce before a nudge is warranted. |

## Provider Catalog

CodePass has a built-in catalog of tools with two kinds of integrations:

- **Harness providers** — terminal tools CodePass can launch, watch, hand off to, and switch
  between directly.
- **Guided integrations** — tools reached through another provider's own configuration rather than
  launched by CodePass itself.

| Tool | Kind | Enabled by default | Notes |
|---|---|---|---|
| Claude Code (`claude`) | Harness | Yes | Receives the session prompt as a positional CLI argument. |
| Codex (`codex`) | Harness | Yes | Receives the session prompt as a positional CLI argument. |
| Google Antigravity (`agy`) | Harness | Yes | Uses `agy --prompt-interactive` with the session prompt. |
| opencode (`opencode`) | Harness | Yes | Launched with `--prompt "{{sessionPrompt}}"`. |
| Grok Build (`grok`) | Harness | Yes | Receives the session prompt as a positional CLI argument (`grok "…"`). |
| Cursor Agent (`agent`) | Harness | Yes | Receives the session prompt as a positional CLI argument (`agent "…"`). Config name is `cursor`. |
| Cline (`cline`) | Harness | No | Interactive TUI via `cline -i "…"`. Configure a model with `cline auth` first. |
| Aider (`aider`) | Harness | No | Interactive REPL + bootstrap paste (not `--message`, which exits). Configure a model/API key first. |
| Goose (`goose`) | Harness | No | Runs `goose session` + bootstrap paste. Configure a provider with `goose configure` first. |
| Amp (`amp`) | Harness | No | Interactive `amp` + bootstrap paste (not `amp -x`). Sign in or set `AMP_API_KEY`. |
| Factory Droid (`droid`) | Harness | No | Positional interactive prompt (`droid "…"`). Login or set `FACTORY_API_KEY`. |
| GitHub Copilot CLI (`copilot`) | Harness | No | Interactive `copilot` + bootstrap paste (not `-p`). Needs a Copilot subscription. |
| Ollama (`ollama`) | Harness | No | Runs a local model (`ollama run llama3.2` by default) — enable once you've pulled a model. It's a plain chat REPL, not an autonomous agent. |
| OpenRouter | Guided | No | Not a standalone CLI — configure it as a model provider inside opencode or Cline. |

Run `codepass doctor --all` to see the full catalog with install/setup notes for tools you haven't
enabled yet.

Several opt-in tools use a PTY bootstrap paste because their interactive mode does not take a
durable multi-turn prompt as argv (or their prompt flags are one-shot): Ollama, Aider, Goose,
Amp, and GitHub Copilot CLI. The paste is a **single line** pointing at the handoff file (pasted
after first tool output or ~750ms), so multi-line session text is not split into many submits.

## Commands

| Command | What it does |
|---|---|
| `codepass` | Start (or resume) the interactive harness. |
| `codepass init` | Create the config file and `.codepass/` folders without running the wizard. |
| `codepass setup` | Re-run the guided setup wizard. |
| `codepass providers` | Edit your tool order (add `--all` to browse the full catalog). |
| `codepass doctor` | Check your config, tool availability, and git context (add `--all` for the full catalog). |
| `codepass handoff` | Show the current handoff file's path and a preview. |
| `codepass session` | Show a summary of the most recent harness session. |
| `codepass clear` | Delete local handoff and session files (add `--yes` to skip the confirmation). |
| `codepass --help` | See every command and option. |

## Tool Updates

By default, CodePass checks your selected tools each time it starts and **asks before** running
their verified native updater when one is available (e.g. `claude update`, `codex update`,
`opencode upgrade`, `grok update`, `agent update`, `amp update`, `droid update`, `aider --upgrade`).
It never guesses an installer for a tool without a verified update command —
those tools just show up as "add later" with setup guidance instead.

Advanced users can change this in `codepass.config.json`:

```json
"updates": {
  "checkOnStart": true,
  "mode": "prompt",
  "includeDisabledProviders": false
}
```

Use `"mode": "always"` to run updates without asking, or `"mode": "off"` to skip the check
entirely.

## Cline And OpenRouter

Cline is part of the catalog but disabled by default. Once it's installed and its CLI flags are
verified on your machine, enable it in setup or `codepass.config.json`.

OpenRouter isn't a CLI CodePass launches directly — it's a model gateway. Configure it as a model
provider inside Cline or opencode's own provider settings (`opencode providers`), then enable that
tool in CodePass as usual.

## Where Things Are Saved

Everything CodePass writes lives under `.codepass/` in your project's working directory:

```txt
.codepass/current/handoff.md   the live handoff file for the current session
.codepass/handoffs/            archived handoffs from past sessions
.codepass/sessions/            session summaries (start/end time, tools tried, changed files)
```

Run `codepass clear` any time you want to wipe these.

## Safety Defaults

- CodePass never pushes changes.
- CodePass never commits by default.
- CodePass is upfront that exact private session transfer isn't possible — the handoff file is
  the shared continuity layer instead.
- Tool commands are configured explicitly; nothing is guessed or auto-installed without asking.
- Handoff prompts are generated entirely locally from your repo context and terminal transcript —
  no extra network calls.

## Building From Source / Contributing

CodePass is a small TypeScript CLI (Node 20+). To work on it directly:

```sh
git clone https://github.com/garrettsiegel/codepass.git
cd codepass
pnpm install
pnpm build
pnpm test
```

```sh
pnpm dev              # run the CLI directly with tsx, no build step needed
pnpm dev -- doctor    # pass args through to a specific command
```

Before committing, make sure `pnpm build`, `pnpm test`, and `pnpm lint` all pass.

### Releasing

`pnpm release <patch|minor|major|<semver>>` runs build/test/lint, bumps the version, commits and
tags it, pushes `main` + tags to origin, and publishes to npm — in one step. It refuses to run
from a branch other than `main`, with a dirty working tree, or out of sync with `origin/main`, and
prompts for confirmation before it pushes or publishes (pass `--yes` to skip the prompt). Preview
what would happen, including the packed npm contents, without any git or npm mutation:

```sh
pnpm release patch --dry-run
```

See [CLAUDE.md](./CLAUDE.md) for the architecture guide (module layout, conventions, known
gotchas) and [GAMEPLAN.md](./GAMEPLAN.md) for the project's original brief, design vision, and the
full V1 execution history.
