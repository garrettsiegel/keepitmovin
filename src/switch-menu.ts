import { select } from "@inquirer/prompts";
import type { InteractiveProviderConfig } from "./types.js";

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
    message: `CodePass noticed ${reason}. Which tool should continue?`,
    choices: choices.map((choice) => ({
      name: choice.provider.label,
      value: choice.provider.name
    }))
  });

  return choices.find((choice) => choice.provider.name === selectedName);
};
