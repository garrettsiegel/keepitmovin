# keepitmovin

[![npm version](https://img.shields.io/npm/v/keepitmovin.svg)](https://www.npmjs.com/package/keepitmovin)
[![ci](https://github.com/garrettsiegel/keepitmovin/actions/workflows/ci.yml/badge.svg)](https://github.com/garrettsiegel/keepitmovin/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/keepitmovin.svg)](./LICENSE)
[![Node >=22.12](https://img.shields.io/node/v/keepitmovin.svg)](https://nodejs.org)

### Agents hit limits. Your work doesn't.

![keepitmovin automatically hands off from a rate-limited Claude Code to Codex, mid-task](https://raw.githubusercontent.com/garrettsiegel/keepitmovin/main/public/kim-demo.gif)

**keepitmovin runs your AI coding tools in one terminal, in a fallback order you choose. When one
hits its usage limit, keepitmovin hands the next tool a structured record of the goal, changes,
blockers, and next step** — so switching tools doesn't mean starting over.

## Install

```sh
npm install -g keepitmovin
kim
```

Or run it without installing anything: `npx keepitmovin`.

On first run, keepitmovin detects which tools you have installed and asks one question: which ones
do you want to use. It suggests a fallback order and offers to change it. Every run after that
starts immediately.

## How it works

1. **`kim` starts your first tool** in a real terminal. It looks and feels exactly like running that
   tool directly — your keystrokes go straight through.
2. **keepitmovin watches for trouble** — a usage limit, quota issue, sign-in failure, or a usage
   check showing the tool is nearly spent — while keeping `.keepitmovin/current/handoff.md` updated
   with your goal, changed files, blockers, and next step.
3. **When a tool is blocked, the next one takes over**, already holding the handoff file. You see a
   short "switching tools" message and the work continues.

Press <kbd>Ctrl</kbd>+<kbd>]</kbd> any time to switch tools right now — useful when you just want a
different tool's take, not only when a limit hits.

### What it can't do

keepitmovin cannot copy a tool's private chat/session state into another tool — no coding agent
exposes a reliable API for that. Instead of pretending to transfer your conversation, it preserves
*practical* continuity: the handoff file, your working directory, git status and changed files,
project instructions like `AGENTS.md`, terminal transcript excerpts, and the reason for the switch.

The active tool keeps that file updated as it works, so this costs no extra AI calls.

## Supported tools

keepitmovin fully supports nine tools. Each has a verified way to start it, pass it your task, and
recognize its exact limit messages — so the handoff fires reliably.

| Tool | How keepitmovin starts it |
|---|---|
| Claude Code (`claude`) | Passes your task as a command-line argument. |
| Codex (`codex`) | Passes your task as a command-line argument. |
| Kimi CLI (`kimi`) | Starts the app, then hands it the handoff file (its `-p` mode exits after one turn). |
| Google Antigravity (`agy`) | Uses `agy --prompt-interactive` with your task. |
| opencode (`opencode`) | Starts with `--prompt`. opencode retries limits forever instead of exiting, so keepitmovin hands off on its retry message. |
| Grok Build (`grok`) | Passes your task as a command-line argument. |
| Cursor Agent (`agent`) | Passes your task as a command-line argument. Config name is `cursor`. |
| GitHub Copilot CLI (`copilot`) | Starts the app, then hands it the handoff file. Needs a Copilot subscription. |
| Ollama (`ollama`) | Local last resort — runs `ollama run llama3.2` (change the model to one you've pulled). A chat model for advice and planning, not a file-editing tool, so it sits last. |

Kimi CLI, GitHub Copilot CLI, and Ollama can't take your task as a command-line argument, so
keepitmovin starts them and pastes a single line pointing at the handoff file. This is automatic.

Each tool's limit messages were gathered from its source code, GitHub issues, and docs, then locked
in with tests. They're verified against reported messages, not live limit events (which can't be
forced on demand), so keepitmovin keeps a general-purpose limit detector as a backup.

More tools (Cline, Aider, Goose, Amp, Factory Droid, and the OpenRouter gateway) sit in the catalog
but stay hidden until their limit detection gets the same verification. `kim doctor --all` lists
them.

## Commands

| Command | What it does |
|---|---|
| `kim` | Start (or resume) your session. |
| `kim providers` | Change which tools you use and their fallback order (`--all` browses every tool, `--reset` starts over from the defaults). |
| `kim doctor` | Check your config, tools, and git status (`--all` includes unverified tools). |
| `kim handoff` | Show the current handoff file's path and a preview. |
| `kim session` | Show a summary of your most recent session. |
| `kim clear` | Delete local handoff and session files (`--yes` skips the confirmation). |
| `kim mcp` | Serve the read-only MCP continuity integration (`kim mcp install` sets it up in your other tools). |
| `kim --help` | See every command and option. |

## Configuration

keepitmovin works with no config at all. For the optional settings — usage checks, handoff refresh,
the idle timeout, tool updates, task routing, and MCP — see
**[docs/configuration.md](./docs/configuration.md)**.

## Safety defaults

- keepitmovin never pushes changes, and never commits by default.
- Tool commands are configured explicitly; nothing is guessed or auto-installed without asking.
- Handoff prompts are generated entirely locally from your repo context and terminal transcript —
  no extra network calls.
- Handoff files and session logs under `.keepitmovin/` can contain secrets. keepitmovin gitignores
  them and best-effort redacts common credential formats, but treat them as sensitive.

## Contributing

keepitmovin is a small TypeScript CLI (Node 22.12+). See
[CONTRIBUTING.md](./CONTRIBUTING.md) to build it from source, and [CLAUDE.md](./CLAUDE.md) for the
architecture guide. Release history lives in [CHANGELOG.md](./CHANGELOG.md), also published at
[keepitmovin.dev/changelog](https://www.keepitmovin.dev/changelog).
