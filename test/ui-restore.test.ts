import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installTerminalRestoreHook, restoreTerminal } from "../src/ui/restore.js";

// If this breaks, the user is left with a shell that echoes nothing and shows
// no cursor after keepitmovin exits — visible, and not obviously keepitmovin's
// fault. Worth testing even though it is ten lines.
const SHOW_CURSOR = "\x1b[?25h";

// `isTTY` is absent (not merely false) on vitest's piped streams, so it is
// assigned directly rather than spied on.
const stubTty = (options: { stdinTty: boolean; stdoutTty: boolean }) => {
  const setRawMode = vi.fn();
  const write = vi.fn(() => true);
  const original = {
    stdinTty: process.stdin.isTTY,
    stdoutTty: process.stdout.isTTY,
    setRawMode: process.stdin.setRawMode,
    write: process.stdout.write
  };

  process.stdin.isTTY = options.stdinTty;
  process.stdout.isTTY = options.stdoutTty;
  process.stdin.setRawMode = setRawMode as unknown as typeof process.stdin.setRawMode;
  process.stdout.write = write as unknown as typeof process.stdout.write;

  return {
    setRawMode,
    write,
    restore: () => {
      process.stdin.isTTY = original.stdinTty;
      process.stdout.isTTY = original.stdoutTty;
      process.stdin.setRawMode = original.setRawMode;
      process.stdout.write = original.write;
    }
  };
};

describe("restoreTerminal", () => {
  afterEach(() => vi.restoreAllMocks());

  it("leaves raw mode and shows the cursor again on a TTY", () => {
    const tty = stubTty({ stdinTty: true, stdoutTty: true });
    try {
      restoreTerminal();
      expect(tty.setRawMode).toHaveBeenCalledWith(false);
      expect(tty.write).toHaveBeenCalledWith(SHOW_CURSOR);
    } finally {
      tty.restore();
    }
  });

  it("does nothing when stdin and stdout are not TTYs (piped or CI)", () => {
    const tty = stubTty({ stdinTty: false, stdoutTty: false });
    try {
      restoreTerminal();
      expect(tty.setRawMode).not.toHaveBeenCalled();
      expect(tty.write).not.toHaveBeenCalled();
    } finally {
      tty.restore();
    }
  });

  it("swallows errors from an already-closed stream", () => {
    const tty = stubTty({ stdinTty: true, stdoutTty: true });
    tty.setRawMode.mockImplementation(() => {
      throw new Error("EBADF: stdin is gone");
    });
    tty.write.mockImplementation(() => {
      throw new Error("EPIPE: stdout is gone");
    });
    try {
      // It runs from an "exit" handler, so a throw here would mask the real error.
      expect(() => restoreTerminal()).not.toThrow();
    } finally {
      tty.restore();
    }
  });

  it("is safe to call repeatedly", () => {
    const tty = stubTty({ stdinTty: true, stdoutTty: true });
    try {
      restoreTerminal();
      restoreTerminal();
      expect(tty.setRawMode).toHaveBeenCalledTimes(2);
      expect(tty.setRawMode).toHaveBeenLastCalledWith(false);
    } finally {
      tty.restore();
    }
  });
});

describe("installTerminalRestoreHook", () => {
  it("registers the exit hook only once however often it is called", () => {
    const before = process.listenerCount("exit");

    installTerminalRestoreHook();
    const afterFirst = process.listenerCount("exit");
    installTerminalRestoreHook();
    installTerminalRestoreHook();

    expect(process.listenerCount("exit")).toBe(afterFirst);
    // Either this test installed it, or an earlier import already did.
    expect(afterFirst).toBeGreaterThanOrEqual(before);
  });
});
