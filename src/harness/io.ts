import process from "node:process";

export interface SessionIoOptions {
  input: NodeJS.ReadStream | undefined;
  output: NodeJS.WriteStream | undefined;
  /** Raw bytes that mean "switch tools now". */
  manualSwitchSequence: string;
  /** Any keystroke — used to reset the idle timer and progress watchdog. */
  onActivity: () => void;
  onManualSwitch: () => void;
  /** Ctrl-C / SIGTERM. */
  onAbort: () => void;
  /** Mirror a keystroke to the child. */
  writeToChild: (data: string) => void;
  /** Resize the child's pty, if it has one. */
  resizeChild: (cols: number, rows: number) => void;
  /**
   * True while the deferred bootstrap paste has not landed. Keystrokes typed in
   * that window are held back, otherwise early input interleaves with and
   * corrupts the pasted prompt.
   */
  isBootstrapPending: () => boolean;
}

export interface SessionIo {
  /** Send any keystrokes held back during the bootstrap window. */
  flushPendingInput: () => void;
  /** Remove every listener and restore the terminal. Idempotent. */
  detach: () => void;
}

/**
 * Wires stdin/stdout and process signals to one provider attempt.
 *
 * Extracted from harness-session.ts, which had grown past the project's 250-LOC
 * limit and mixed this terminal plumbing in with the detection and exit logic.
 */
export const attachSessionIo = (options: SessionIoOptions): SessionIo => {
  const { input, output } = options;
  const pendingChildInput: string[] = [];
  let detached = false;

  const flushPendingInput = (): void => {
    if (pendingChildInput.length === 0) {
      return;
    }

    options.writeToChild(pendingChildInput.splice(0).join(""));
  };

  const onResize = (): void => {
    try {
      options.resizeChild(
        output?.columns || process.stdout.columns || 80,
        output?.rows || process.stdout.rows || 24
      );
    } catch {
      // The child exited between the resize event and this call.
    }
  };

  const onInput = (chunk: Buffer): void => {
    options.onActivity();

    if (chunk.toString("utf8").includes(options.manualSwitchSequence)) {
      options.onManualSwitch();
      return;
    }

    if (options.isBootstrapPending()) {
      pendingChildInput.push(chunk.toString());
      return;
    }

    options.writeToChild(chunk.toString());
  };

  const onAbort = (): void => options.onAbort();

  // Only resume a stream that wasn't already flowing, so detach() can safely
  // pause it again. A resumed, ref'd TTY stdin keeps the event loop alive and
  // would stop `kim` from ever exiting.
  const resumedInput = input !== undefined && input.isPaused?.() !== false;

  input?.setRawMode?.(true);
  if (resumedInput) {
    input.resume();
  }
  input?.on("data", onInput);
  output?.on?.("resize", onResize);
  process.once("SIGINT", onAbort);
  process.once("SIGTERM", onAbort);

  const detach = (): void => {
    if (detached) {
      return;
    }

    detached = true;
    input?.off("data", onInput);
    input?.setRawMode?.(false);
    if (resumedInput) {
      input?.pause();
    }
    output?.off?.("resize", onResize);
    process.off("SIGINT", onAbort);
    process.off("SIGTERM", onAbort);
  };

  return { flushPendingInput, detach };
};
