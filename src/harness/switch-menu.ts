import { isCancel, select } from "@clack/prompts";
import type { InteractiveProviderConfig } from "../config/types.js";

export interface SwitchChoice {
  provider: InteractiveProviderConfig;
  index: number;
}

export type SwitchSelector = (
  choices: SwitchChoice[],
  reason: string
) => Promise<SwitchChoice | undefined>;

export const chooseSwitchProvider: SwitchSelector = async (choices, reason) => {
  if (choices.length === 0) {
    return undefined;
  }

  if (choices.length === 1) {
    return choices[0];
  }

  const selectedName = await select({
    message: `keepitmovin noticed ${reason}. Which tool should continue?`,
    options: choices.map((choice) => ({
      label: choice.provider.label,
      value: choice.provider.name
    }))
  });

  if (isCancel(selectedName)) {
    return undefined;
  }

  return choices.find((choice) => choice.provider.name === selectedName);
};
