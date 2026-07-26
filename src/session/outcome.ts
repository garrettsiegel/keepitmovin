import { isCancel, select } from "@clack/prompts";
import type { SessionOutcome } from "../config/types.js";

export type OutcomeSelector = () => Promise<SessionOutcome>;

export const chooseSessionOutcome: OutcomeSelector = async () => {
  const outcome = await select<SessionOutcome>({
    message: "How did this routed task end?",
    options: [
      { value: "completed", label: "Completed" },
      { value: "partial", label: "Partial progress" },
      { value: "failed", label: "Failed" },
      { value: "abandoned", label: "Abandoned" }
    ],
    initialValue: "completed"
  });
  return isCancel(outcome) ? "unknown" : outcome;
};
