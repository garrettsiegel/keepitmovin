# CodePass

CodePass is an interactive terminal harness for coding agents.

The goal is simple:

```sh
codepass
```

CodePass walks you through setup, checks which tools are available, lets you choose your fallback order, starts the first coding tool, and can hand off to the next one when it sees a recognizable limit or failure.

Example chain:

```txt
Claude Code -> Codex -> Google Antigravity -> opencode -> Cline with OpenRouter later
```

## The Important Limitation

CodePass cannot copy a provider's private live chat/session state into another provider unless that provider exposes a supported API for it.

CodePass preserves practical continuity with a live handoff file instead:

- `.codepass/current/handoff.md`
- current working directory
- git status and diff
- changed files
- project instructions like `AGENTS.md`
- terminal transcript excerpts
- failure reason
- generated handoff prompt

## Quick Start In This Monorepo

From the monorepo root:

```sh
~/Library/pnpm/pnpm install
~/Library/pnpm/pnpm codepass:build
~/Library/pnpm/pnpm codepass:doctor
~/Library/pnpm/pnpm codepass
```

On first run, CodePass starts a guided setup wizard.

## Main Commands

Start the interactive harness:

```sh
~/Library/pnpm/pnpm codepass
```

Show the live handoff file:

```sh
~/Library/pnpm/pnpm codepass -- handoff
```

Clear local handoff/session artifacts:

```sh
~/Library/pnpm/pnpm codepass -- clear
```

Run setup again:

```sh
~/Library/pnpm/pnpm codepass -- setup
```

Check setup health:

```sh
~/Library/pnpm/pnpm codepass:doctor
~/Library/pnpm/pnpm codepass -- doctor --all
```

Edit provider order:

```sh
~/Library/pnpm/pnpm codepass -- providers
~/Library/pnpm/pnpm codepass -- providers --all
```

Show the latest harness session summary:

```sh
~/Library/pnpm/pnpm codepass -- session
```

Use the older task-based fallback mode:

```sh
~/Library/pnpm/pnpm codepass -- run "fix the failing tests"
```

Task-mode shorthand still works when you pass a task:

```sh
~/Library/pnpm/pnpm codepass -- "fix the failing tests"
```

## How The Harness Works

1. CodePass loads `codepass.config.json`.
2. If setup is incomplete, CodePass asks which providers you want. If setup is already complete, CodePass shows your saved chain and asks whether to launch it, reconfigure it, or start fresh (this prompt is skipped when stdin is not a TTY, e.g. piped input — it just reuses your saved chain).
3. CodePass launches the first enabled provider in a pseudo-terminal.
4. CodePass creates `.codepass/current/handoff.md` and tells the active tool to keep it updated.
5. CodePass mirrors your terminal input/output so the provider still feels native.
6. CodePass keeps a rolling transcript buffer as backup.
7. If output looks like a rate limit, quota issue, auth failure, or eligible process failure, CodePass pauses that provider.
8. CodePass appends a checkpoint to the handoff file.
9. CodePass asks which tool should continue, then launches it with the handoff file prompt.
10. CodePass writes a session summary in `.codepass/sessions/` and archives the handoff in `.codepass/handoffs/`.

Manual switch:

```txt
Ctrl+]
```

Press this while a tool is running to ask CodePass to switch tools.

## Popular Integrations

CodePass now has a built-in provider catalog with two kinds of integrations:

- True harness providers: terminal tools CodePass can launch, watch, hand off to, and switch between.
- Guided integrations: popular IDE/cloud tools CodePass can explain or detect, but not control until they expose a supported local CLI, API, ACP bridge, or extension bridge.

See [POPULAR_TOOLS.md](./POPULAR_TOOLS.md) for the full catalog, setup notes, and current limitations.

## Default Harness Providers

Interactive harness defaults:

1. Claude Code: `claude`
2. Codex: `codex`
3. Google Antigravity: `antigravity`, bootstrapped with the session prompt
4. opencode: `opencode "{{cwd}}" --prompt "{{sessionPrompt}}"`
5. Cline: disabled until installed/configured

Add-later terminal providers:

- Aider
- Goose
- Kiro CLI
- Amp

Handoff launches:

```txt
claude "{{handoffPrompt}}"
codex "{{handoffPrompt}}"
antigravity
opencode "{{cwd}}" --prompt "{{handoffPrompt}}"
cline "{{handoffPrompt}}"
```

Some tools do not have a clean prompt argument. For those, CodePass launches the tool and types the handoff prompt into the PTY automatically through `bootstrapInput`.

## Tool Updates

By default, `codepass` checks selected tools each time it starts and runs verified native updater commands when available, such as `claude update`, `codex update`, and `opencode upgrade`.

CodePass does not guess unsafe installers for tools without verified update commands. Missing tools stay as “add later” with setup guidance.

Advanced users can change this in `codepass.config.json`:

```json
"updates": {
  "checkOnStart": true,
  "mode": "always",
  "includeDisabledProviders": false
}
```

Use `"mode": "prompt"` to ask first, or `"mode": "off"` to disable startup update checks.

## Cline And OpenRouter

Cline is part of the config model but disabled by default because it is not currently installed on PATH here.

Once Cline is installed and its CLI flags are verified, enable it in setup or `codepass.config.json`, then configure its provider/model args for OpenRouter/DeepSeek.

## Logs

Task-mode logs:

```txt
.codepass/runs/
```

Harness session logs:

```txt
.codepass/sessions/
```

Live and archived handoffs:

```txt
.codepass/current/handoff.md
.codepass/handoffs/
```

## Safety Defaults

- CodePass never pushes changes.
- CodePass never commits by default.
- CodePass explains that exact private session transfer is not guaranteed.
- CodePass uses the handoff file as the shared continuity layer.
- Provider commands are configured explicitly.
- Handoff prompts are generated locally from repo context and transcript excerpts.

## Development Checks

```sh
~/Library/pnpm/pnpm --filter codepass build
~/Library/pnpm/pnpm --filter codepass test
~/Library/pnpm/pnpm --filter codepass lint
```
