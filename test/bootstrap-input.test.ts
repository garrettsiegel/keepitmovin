import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOOTSTRAP_MAX_WAIT_MS,
  BOOTSTRAP_QUIET_MS,
  createBootstrapWriter
} from "../src/bootstrap-input.js";
import type { PtyProcess } from "../src/pty-factory.js";

const makeChild = (): { child: PtyProcess; writes: string[] } => {
  const writes: string[] = [];
  const child = { write: (data: string) => writes.push(data) } as unknown as PtyProcess;
  return { child, writes };
};

describe("createBootstrapWriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for an output lull instead of pasting on the first chunk", () => {
    const { child, writes } = makeChild();
    const writer = createBootstrapWriter(child, "PASTE\n", { isSettled: () => false });

    writer.arm();
    writer.onChildData(); // first splash chunk — must NOT paste yet
    vi.advanceTimersByTime(BOOTSTRAP_QUIET_MS - 1);
    expect(writes).toEqual([]);

    vi.advanceTimersByTime(1); // lull elapsed
    expect(writes).toEqual(["PASTE\n"]);
    expect(writer.isWritten()).toBe(true);
  });

  it("debounces: continued output keeps resetting the lull timer", () => {
    const { child, writes } = makeChild();
    const writer = createBootstrapWriter(child, "PASTE\n", { isSettled: () => false });

    writer.arm();
    for (let i = 0; i < 5; i += 1) {
      writer.onChildData();
      vi.advanceTimersByTime(BOOTSTRAP_QUIET_MS - 10);
    }
    expect(writes).toEqual([]); // never went quiet long enough

    vi.advanceTimersByTime(BOOTSTRAP_QUIET_MS);
    expect(writes).toEqual(["PASTE\n"]);
  });

  it("pastes at the hard backstop when the tool emits no output", () => {
    const { child, writes } = makeChild();
    const writer = createBootstrapWriter(child, "PASTE\n", { isSettled: () => false });

    writer.arm();
    vi.advanceTimersByTime(BOOTSTRAP_MAX_WAIT_MS);
    expect(writes).toEqual(["PASTE\n"]);
  });

  it("does not paste once the session has settled", () => {
    const { child, writes } = makeChild();
    let settled = false;
    const writer = createBootstrapWriter(child, "PASTE\n", { isSettled: () => settled });

    writer.arm();
    writer.onChildData();
    settled = true; // provider killed before the lull elapsed
    vi.advanceTimersByTime(BOOTSTRAP_MAX_WAIT_MS);
    expect(writes).toEqual([]);
    expect(writer.isWritten()).toBe(false);
  });

  it("reports written immediately when there is no bootstrap input", () => {
    const { child, writes } = makeChild();
    const writer = createBootstrapWriter(child, undefined, { isSettled: () => false });

    writer.arm();
    writer.onChildData();
    vi.advanceTimersByTime(BOOTSTRAP_MAX_WAIT_MS);
    expect(writes).toEqual([]);
    // No paste is pending, so stdin should flow immediately (isWritten === true).
    expect(writer.isWritten()).toBe(true);
  });

  it("fires onWritten exactly once", () => {
    const { child } = makeChild();
    const onWritten = vi.fn();
    const writer = createBootstrapWriter(child, "PASTE\n", { isSettled: () => false, onWritten });

    writer.arm();
    writer.onChildData();
    vi.advanceTimersByTime(BOOTSTRAP_QUIET_MS);
    writer.onChildData(); // late output must not re-paste
    vi.advanceTimersByTime(BOOTSTRAP_MAX_WAIT_MS);
    expect(onWritten).toHaveBeenCalledTimes(1);
  });
});
