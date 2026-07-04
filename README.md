# CodePass

![CodePass](./public/Gemini_Generated_Image_dg5cwbdg5cwbdg5c.png)

**CodePass is a terminal harness that lets you switch between AI coding agents — Claude Code,
Codex, Antigravity, opencode, Cline, Ollama — without losing your place.**

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
Claude Code -> Codex -> Google Antigravity -> opencode -> Cline with OpenRouter later
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
- git status and diff
- changed files
- project instructions like `AGENTS.md`
- terminal transcript excerpts
- the reason the switch happened
- a generated handoff prompt for the next tool

The active tool is instructed to keep this file updated as it works — CodePass doesn't make any
extra AI calls to do this, so it costs you nothing beyond what the tool would already use.

## How It Works

1. CodePass loads `codepass.config.json` (or built-in defaults if none exists yet).
2. First run: CodePass asks which tools you want, in what order. Later runs: CodePass shows your
   saved chain and asks whether to launch it, reconfigure it, or start fresh.
3. CodePass launches the first enabled tool in a real pseudo-terminal — it looks and feels exactly
   like running that tool directly.
4. CodePass creates `.codepass/current/handoff.md` and tells the active tool to keep it updated.
5. Your terminal input/output is mirrored straight through, so the tool stays fully interactive.
6. If output looks like a rate limit, quota issue, auth failure, or another recognizable failure,
   CodePass pauses that tool.
7. CodePass appends a checkpoint to the handoff file, shows a short "commercial break" message
   explaining what happened, and launches the next tool with the handoff already loaded.
8. CodePass writes a session summary and archives the handoff for the record.

You can also switch manually at any time:

```txt
Ctrl+]
```

Press this while a tool is running to ask CodePass to switch tools right now — useful if you just
want a different tool's take on something, not only when a limit hits.

## Provider Catalog

CodePass has a built-in catalog of tools with two kinds of integrations:

- **Harness providers** — terminal tools CodePass can launch, watch, hand off to, and switch
  between directly.
- **Guided integrations** — tools reached through another provider's own configuration rather than
  launched by CodePass itself.

| Tool | Kind | Enabled by default | Notes |
|---|---|---|---|
| Claude Code (`claude`) | Harness | Yes | Bootstrapped with the session prompt. |
| Codex (`codex`) | Harness | Yes | Bootstrapped with the session prompt. |
| Google Antigravity (`agy`) | Harness | Yes | Bootstrapped with the session prompt via its `agy` TUI. |
| opencode (`opencode`) | Harness | Yes | Launched with `--prompt "{{sessionPrompt}}"`. |
| Cline (`cline`) | Harness | No | Enable once installed and its model/provider is configured. |
| Ollama (`ollama`) | Harness | No | Runs a local model (`ollama run llama3.2` by default) — enable once you've pulled a model. It's a plain chat REPL, not an autonomous agent. |
| OpenRouter | Guided | No | Not a standalone CLI — configure it as a model provider inside opencode or Cline. |

Run `codepass doctor --all` to see the full catalog with install/setup notes for tools you haven't
enabled yet.

Some tools don't take a clean prompt argument. For those, CodePass launches the tool and types the
handoff prompt directly into the terminal after it starts.

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

By default, CodePass checks your selected tools each time it starts and runs their verified native
updater when one is available (e.g. `claude update`, `codex update`, `opencode upgrade`). It never
guesses an installer for a tool without a verified update command — those tools just show up as
"add later" with setup guidance instead.

Advanced users can change this in `codepass.config.json`:

```json
"updates": {
  "checkOnStart": true,
  "mode": "always",
  "includeDisabledProviders": false
}
```

Use `"mode": "prompt"` to ask before running an update, or `"mode": "off"` to skip the check
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

See [CLAUDE.md](./CLAUDE.md) for the architecture guide (module layout, conventions, known
gotchas) and [GAMEPLAN.md](./GAMEPLAN.md) for the project's original brief, design vision, and the
full V1 execution history.
