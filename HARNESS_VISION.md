# CodePass Harness Vision Plan

## Summary

CodePass should become a simple interactive harness, not primarily a task-only fallback CLI.

The intended user experience is:

```sh
codepass
```

CodePass then walks the user through setup, login checks, provider order selection, and starts the first chosen coding tool inside the CodePass harness. If that tool hits a limit or fails, CodePass automatically creates a handoff and switches to the next configured tool.

## Product Direction

- Replace "run one non-interactive task" as the main UX with "start one guided coding session."
- Keep the current task runner as a useful fallback mode, but make the primary command `codepass`.
- First-run experience should feel like:
  - Welcome screen
  - Detect installed tools
  - Help user log in or configure API keys
  - Ask which tools/models to use and in what order
  - Save that preference
  - Launch the first provider
- Example chosen chain:
  - Claude Code
  - Codex
  - Cline using DeepSeek V4 Flash through OpenRouter
- During a session, CodePass should explain what is happening in plain language:
  - "Starting Claude Code"
  - "Claude appears rate-limited"
  - "Preparing handoff for Codex"
  - "Starting Codex with your current project context"

## Feasibility Notes

- This is possible as a PTY-based terminal harness: CodePass can spawn `claude`, `codex`, or `cline` as child terminal processes and keep the user inside one CodePass-controlled experience.
- CodePass can detect many limit/failure events by watching provider output for known patterns like rate limits, quota errors, auth failures, or process exits.
- CodePass cannot reliably copy the private internal conversation state from one provider to another unless that provider exposes it through a supported API.
- CodePass can still preserve useful continuity by building a handoff from:
  - current working directory
  - git status and diff
  - recently changed files
  - terminal transcript excerpts
  - user's original intent
  - provider failure reason
  - project instructions like `AGENTS.md`
- Claude Code supports interactive sessions, resume/continue behavior, background sessions, auth status, and remote-control-related commands.
- Codex supports interactive CLI mode, `exec`, `resume`, `doctor`, login, model selection, and local-provider options.
- Cline support should be treated as plugin/provider work because `cline` is not currently installed on PATH here.

## Key Implementation Changes

- Add a new interactive `codepass` command flow:
  - If no config exists, start setup wizard.
  - If config exists, show chosen provider chain and start the harness.
  - Keep `codepass run "task"` or similar for the existing task-based mode.
- Add setup wizard:
  - Check `claude auth status` or equivalent.
  - Check `codex doctor` / `codex login`.
  - Check whether `cline` exists.
  - Ask for OpenRouter configuration only if the user chooses a Cline/OpenRouter-backed model.
  - Save provider chain and model choices in local CodePass config.
- Add provider harness abstraction:
  - `InteractiveProvider` with `start`, `detectFailure`, `buildHandoff`, and `resumeOrLaunch` behavior.
  - Run providers in a pseudo-terminal so interactive tools still feel native.
  - Maintain a rolling transcript buffer for diagnostics and handoff.
- Add automatic handoff:
  - On rate limit or quota failure, stop or detach the current provider.
  - Generate a plain-language handoff prompt.
  - Launch the next provider with that handoff.
  - Tell the user exactly what happened.
- Add user-facing DX:
  - `codepass doctor`: setup health check.
  - `codepass setup`: rerun wizard.
  - `codepass providers`: edit provider order.
  - `codepass session`: show current/last session summary.
  - Friendly explanations instead of raw config-first UX.

## UX Acceptance Criteria

- A new user can type `codepass` and be guided without reading docs first.
- CodePass explains what Claude, Codex, Cline, and OpenRouter setup steps are needed.
- The user can choose provider order without editing JSON.
- CodePass launches the first provider automatically after setup.
- If the first provider hits a recognizable limit, CodePass switches to the next provider and explains the handoff.
- The user can always see where logs/session summaries are saved.
- Advanced users can still configure details manually.

## Test Plan

- Unit tests for setup-state detection and provider-chain config.
- Unit tests for rate-limit/failure pattern detection.
- Integration tests with fake PTY providers that simulate:
  - normal session exit
  - Claude-style rate limit output
  - Codex-style auth failure
  - missing Cline command
  - fallback to next provider
- Snapshot tests for setup wizard copy and handoff prompt copy.
- Manual smoke test:
  - Run `codepass`
  - Choose Claude -> Codex
  - Simulate Claude failure
  - Confirm CodePass launches Codex with generated context

## Assumptions

- The main goal is maximum ease of use, even if the first harness version is less technically perfect than true live-session transfer.
- CodePass should prefer guided prompts over JSON editing.
- Exact session transfer is not guaranteed; practical continuity through handoff summaries is the V1 harness target.
- Current docs/CLI evidence:
  - Claude Code CLI supports interactive start, `--continue`, `--resume`, auth commands, and background/remote-control features.
  - Codex CLI supports interactive mode, `exec`, `resume`, `doctor`, `login`, model selection, and local-provider options.
  - Cline is not currently installed on PATH in this workspace.
