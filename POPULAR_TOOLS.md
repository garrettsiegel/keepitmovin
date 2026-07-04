# CodePass Popular Agent Integrations

CodePass supports two integration levels:

- **True harness providers** are terminal-native tools CodePass can launch inside its PTY harness, watch for limit/failure text, and hand off to with `.codepass/current/handoff.md`.
- **Guided integrations** are popular IDE/cloud tools CodePass can explain, detect, or link to, but cannot safely auto-switch into until they expose a supported CLI, API, ACP bridge, or extension bridge.

CodePass should never pretend a guided integration is controllable. If CodePass cannot launch and observe the tool locally, it stays out of the automatic fallback chain.

## Ready Now

| Tool | Integration | Default command | Auth/setup | Notes |
|---|---:|---|---|---|
| Claude Code | `pty` | `claude "{{sessionPrompt}}"` | Run `claude auth`. | Real harness provider. Handoff launch uses `claude "{{handoffPrompt}}"`. |
| Codex | `pty` | `codex "{{sessionPrompt}}"` | Run `codex login` or configure an OpenAI API key. | Real harness provider. Handoff launch uses `codex "{{handoffPrompt}}"`. |
| Google Antigravity | `pty_with_bootstrap_input` | `antigravity`, then CodePass types `{{sessionPrompt}}` | Install from https://antigravity.google/ and sign in. | Current Google-agent path for CodePass. The CLI is not installed locally here yet. |
| opencode | `pty` | `opencode "{{cwd}}" --prompt "{{sessionPrompt}}"` | Run `opencode providers`. | Real harness provider. Installed locally here. |

## Install To Use

These tools are terminal-first enough for CodePass, but are disabled until installed and verified on the user machine.

| Tool | Integration | Detection command | Setup | Notes |
|---|---:|---|---|---|
| Cline | `pty` | `cline --version` | `npm install -g cline`, then configure providers/models. | Good OpenRouter candidate once CLI flags are verified. |
| Aider | `pty_with_bootstrap_input` | `aider --version` | Install with Aider's Python installer and configure provider keys. | CodePass launches Aider, then types the handoff prompt into the PTY. |
| Goose | `pty_with_bootstrap_input` | `goose --version` | Install Goose and configure Anthropic/OpenAI/Gemini/OpenRouter/Ollama. | CodePass bootstraps with typed input until a better prompt flag is verified. |
| Kiro CLI | `pty_with_bootstrap_input` | `kiro-cli --version` | Install from Kiro CLI docs and sign in. | Disabled until installed locally. |
| Amp | `pty_with_bootstrap_input` | `amp --version` | Install/sign in through Amp. | Disabled until installed locally. |
| Gemini CLI | `external_app` | `gemini --version` | Migrate Google-agent workflows to Antigravity. | Legacy/deprecated path kept for guidance only. Not in CodePass's default auto-switch chain. |

## Popular IDE And Cloud Tools

These are visible in `codepass providers --all` and `codepass doctor --all`, but they are not included in automatic switching.

| Tool | Integration | Why guided only |
|---|---:|---|
| GitHub Copilot / Agent HQ | `cloud_link` | CodePass can guide GitHub/Copilot setup, but cannot live-switch into private GitHub cloud sessions. |
| Cursor | `external_app` | CodePass can detect/link Cursor, but cannot control Cursor's private editor session. |
| Devin | `cloud_link` | CodePass needs a supported local/API bridge before it can launch or observe Devin. |
| OpenHands Agent Canvas | `server` | Best future path is server/API integration, not pretending it is a PTY tool. |
| Continue | `external_app` | Treated as guided/legacy because the repository is read-only/final release. |
| Roo Code | `external_app` | Treated as guided/legacy because the project is archived. |

## Handoff Behavior

Every true harness provider receives one of these:

- a prompt argument such as `{{sessionPrompt}}` or `{{handoffPrompt}}`
- a `bootstrapInput` string CodePass writes into the terminal after launch

The handoff prompt always points to `.codepass/current/handoff.md`. CodePass cannot copy private chat state between tools, so the handoff file is the shared continuity layer.

## Startup Updates

CodePass checks selected harness tools whenever `codepass` starts. For tools with verified native updater commands, CodePass can keep them fresh automatically:

| Tool | Native updater |
|---|---|
| Claude Code | `claude update` |
| Codex | `codex update` |
| opencode | `opencode upgrade` |

The default config uses `"mode": "always"`, which runs those native updaters before launching the harness. Use `"mode": "prompt"` to ask first or `"mode": "off"` to disable startup update checks.

CodePass does not guess installers for unverified tools. Missing tools stay visible as add-later setup guidance until their install/update path is verified.

## Sources Used

Current catalog choices are based on local command availability plus public docs/repositories checked on July 3, 2026:

- Gemini CLI: https://github.com/google-gemini/gemini-cli
- Google Antigravity: https://antigravity.google/
- opencode: https://github.com/anomalyco/opencode
- Cline: https://github.com/cline/cline
- OpenHands: https://github.com/OpenHands/OpenHands
- Goose: https://github.com/aaif-goose/goose
- Aider: https://github.com/Aider-AI/aider
- Kiro CLI: https://kiro.dev/docs/cli/
- Amp: https://ampcode.com/manual
- Roo Code: https://github.com/RooCodeInc/Roo-Code
- Continue: https://github.com/continuedev/continue
- AIDev dataset: https://arxiv.org/abs/2602.09185
