import stripAnsi from "strip-ansi";
import type { HandoffReceiptLog } from "../config/types.js";

const HANDOFF_RECEIPT_PREFIX = "KEEPITMOVIN_RECEIVED ";
const HANDOFF_RECEIPT_TIMEOUT_MS = 60_000;
const MAX_RECEIPT_FIELD_CHARS = 500;
const MAX_BUFFER_CHARS = 16_000;

const cleanField = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().slice(0, MAX_RECEIPT_FIELD_CHARS);
  return cleaned.length > 0 ? cleaned : undefined;
};

const parseHandoffReceiptLine = (
  line: string
): HandoffReceiptLog | undefined => {
  const clean = stripAnsi(line).trim();
  if (!clean.startsWith(HANDOFF_RECEIPT_PREFIX)) return undefined;

  try {
    const parsed = JSON.parse(clean.slice(HANDOFF_RECEIPT_PREFIX.length)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    const restatedGoal = cleanField(record.goal);
    const nextAction = cleanField(record.next);
    if (!restatedGoal || !nextAction) return undefined;
    return {
      status: "received",
      receivedAt: new Date().toISOString(),
      restatedGoal,
      nextAction
    };
  } catch {
    return undefined;
  }
};

interface HandoffReceiptTracker {
  append(data: string): HandoffReceiptLog | undefined;
  snapshot(): HandoffReceiptLog;
  stop(): void;
}

export const createHandoffReceiptTracker = (options: {
  expected: boolean;
  onReceipt?: (receipt: HandoffReceiptLog) => void;
  onTimeout?: () => void;
}): HandoffReceiptTracker => {
  if (!options.expected) {
    return {
      append: () => undefined,
      snapshot: () => ({ status: "not_applicable" }),
      stop: () => undefined
    };
  }

  let buffer = "";
  let receipt: HandoffReceiptLog = { status: "missing" };
  let stopped = false;
  const timer = setTimeout(() => {
    if (!stopped && receipt.status === "missing") options.onTimeout?.();
  }, HANDOFF_RECEIPT_TIMEOUT_MS);
  timer.unref?.();

  return {
    append(data) {
      if (stopped || receipt.status === "received") return undefined;
      buffer = `${buffer}${stripAnsi(data)}`.slice(-MAX_BUFFER_CHARS);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const parsed = parseHandoffReceiptLine(line);
        if (!parsed) continue;
        receipt = parsed;
        clearTimeout(timer);
        options.onReceipt?.(parsed);
        return parsed;
      }
      return undefined;
    },
    snapshot: () => receipt,
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
    }
  };
};
