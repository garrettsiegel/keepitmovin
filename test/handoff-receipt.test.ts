import { describe, expect, it, vi } from "vitest";
import {
  createHandoffReceiptTracker,
  parseHandoffReceiptLine
} from "../src/handoff/receipt.js";

describe("handoff receipt", () => {
  it("parses a valid receipt and caps stored fields", () => {
    const line = `KEEPITMOVIN_RECEIVED ${JSON.stringify({ goal: "ship it", next: "run tests" })}`;
    expect(parseHandoffReceiptLine(line, "2026-07-19T00:00:00.000Z")).toEqual({
      status: "received",
      receivedAt: "2026-07-19T00:00:00.000Z",
      restatedGoal: "ship it",
      nextAction: "run tests"
    });
  });

  it("rejects malformed, incomplete, and prompt-echo lines", () => {
    expect(parseHandoffReceiptLine("KEEPITMOVIN_RECEIVED nope")).toBeUndefined();
    expect(parseHandoffReceiptLine('KEEPITMOVIN_RECEIVED {"goal":"x"}')).toBeUndefined();
    expect(parseHandoffReceiptLine("Reply with KEEPITMOVIN_RECEIVED followed by JSON")).toBeUndefined();
  });

  it("handles ANSI and receipts split across chunks", () => {
    const onReceipt = vi.fn();
    const tracker = createHandoffReceiptTracker({ expected: true, onReceipt });
    tracker.append("\u001b[32mKEEPITMOVIN_RECEI");
    tracker.append('VED {"goal":"continue","next":"inspect"}\u001b[0m\r\n');
    expect(tracker.snapshot()).toMatchObject({
      status: "received",
      restatedGoal: "continue",
      nextAction: "inspect"
    });
    expect(onReceipt).toHaveBeenCalledOnce();
    tracker.stop();
  });

  it("warns after the timeout but keeps a missing status", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const tracker = createHandoffReceiptTracker({ expected: true, timeoutMs: 10, onTimeout });
    await vi.advanceTimersByTimeAsync(10);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(tracker.snapshot()).toEqual({ status: "missing" });
    tracker.stop();
    vi.useRealTimers();
  });

  it("marks the first provider as not applicable", () => {
    const tracker = createHandoffReceiptTracker({ expected: false });
    expect(tracker.snapshot()).toEqual({ status: "not_applicable" });
  });
});
