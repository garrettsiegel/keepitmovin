import type { PtyProcess } from "./pty-factory.js";

// Paste the bootstrap once the child's output has stayed quiet this long. A lull
// in output is the best available signal that a TUI has finished painting its
// splash and is now waiting for input — pasting on the FIRST output chunk instead
// lands mid-splash, exactly the window where TUIs drop stdin.
export const BOOTSTRAP_QUIET_MS = 400;
// Hard backstop: paste no later than this after arming even if output never
// settles (continuous stream) or the tool emits nothing at all.
export const BOOTSTRAP_MAX_WAIT_MS = 2000;

export interface BootstrapWriter {
  /** Arm the settle/backstop paste. No-op when bootstrapInput is absent. */
  arm: () => void;
  /** Call from onData: (re)start the quiet timer so the paste waits for a lull. */
  onChildData: () => void;
  /** Cancel any pending timers (call from cleanup / exit). */
  cancel: () => void;
  /** True once the bootstrap has been written (or there was nothing to write). */
  isWritten: () => boolean;
}

/**
 * Pastes bootstrap input once the child's output settles, or after a short hard
 * deadline — TUI tools often drop early stdin during their splash screen.
 */
export const createBootstrapWriter = (
  child: PtyProcess,
  bootstrapInput: string | undefined,
  options: {
    isSettled: () => boolean;
    onWritten?: () => void;
  }
): BootstrapWriter => {
  let written = false;
  let quietTimer: NodeJS.Timeout | undefined;
  let maxTimer: NodeJS.Timeout | undefined;

  const clearTimers = (): void => {
    if (quietTimer) {
      clearTimeout(quietTimer);
      quietTimer = undefined;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = undefined;
    }
  };

  const writeOnce = (): void => {
    if (written || options.isSettled() || !bootstrapInput) {
      return;
    }
    written = true;
    clearTimers();
    child.write(bootstrapInput);
    options.onWritten?.();
  };

  return {
    arm: () => {
      if (!bootstrapInput) {
        return;
      }
      maxTimer = setTimeout(writeOnce, BOOTSTRAP_MAX_WAIT_MS);
    },
    onChildData: () => {
      if (written || !bootstrapInput) {
        return;
      }
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      quietTimer = setTimeout(writeOnce, BOOTSTRAP_QUIET_MS);
    },
    cancel: clearTimers,
    isWritten: () => written || !bootstrapInput
  };
};
