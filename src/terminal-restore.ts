import process from "node:process";

const SHOW_CURSOR = "\x1b[?25h";

/**
 * Put the terminal back the way keepitmovin found it.
 *
 * The harness puts stdin in raw mode and hands the screen to a child TUI. Raw
 * mode is cleared on the normal path, but a throw outside the PTY callbacks — a
 * failed handoff/archive/session-log write, or an exception inside the child's
 * data handler — would skip that cleanup and leave the user with a shell that
 * echoes nothing and shows no cursor.
 *
 * Safe to call repeatedly and from a process "exit" handler: it performs only
 * synchronous work and swallows errors from a stream that is already gone.
 */
export const restoreTerminal = (): void => {
  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(false);
    }
  } catch {
    // stdin already closed — nothing left to restore.
  }

  try {
    if (process.stdout.isTTY) {
      process.stdout.write(SHOW_CURSOR);
    }
  } catch {
    // stdout already closed — nothing left to restore.
  }
};

let installed = false;

/** Register the last-resort restore hook. Idempotent. */
export const installTerminalRestoreHook = (): void => {
  if (installed) {
    return;
  }

  installed = true;
  process.on("exit", restoreTerminal);
  process.on("uncaughtException", (error) => {
    restoreTerminal();
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
};
