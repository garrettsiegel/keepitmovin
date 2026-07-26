import type { AgentErrorType, InteractiveProviderConfig } from "../config/types.js";

export const buildSessionPrompt = (
  handoffPath: string,
  providerChain: InteractiveProviderConfig[],
  task?: string
): string => [
  "You are running inside keepitmovin, which runs coding tools in a row and switches to the next one when one hits a limit.",
  "",
  ...(task ? ["Complete this task:", task, ""] : []),
  `Keep this shared handoff file updated as you work: ${handoffPath}`,
  "",
  "The handoff file is the continuity layer for the next tool. Update it after completing each subtask — not just at the end — whenever the goal, plan, commands run, blockers, or next steps change.",
  "",
  "You own these sections and must revise them in place (overwrite stale content, don't append a log): Current Goal, Working State, Commands And Checks, Blockers, Next Step. keepitmovin automatically maintains Changed Files, Repository Snapshot, Switch History, and Latest Transcript Excerpt — leave those alone. Keep your sections concise; the whole file should stay under ~150 lines.",
  "",
  `Fallback order: ${providerChain.map((provider) => provider.label).join(" -> ")}`,
  "",
  "Do not wait until the end. Keep the handoff useful for another coding agent at any moment."
].join("\n");

export const buildProviderHandoffPrompt = (
  handoffPath: string,
  fromProvider: string,
  toProvider: string,
  reason?: AgentErrorType,
  task?: string
): string => [
  "You are continuing a keepitmovin coding session.",
  "",
  `Read this handoff file first: ${handoffPath}`,
  "",
  `Previous tool: ${fromProvider}`,
  `Current tool: ${toProvider}`,
  `Switch reason: ${reason ?? "unknown"}`,
  "",
  ...(task ? ["Original task:", task, ""] : []),
  "keepitmovin cannot transfer private chat state. The handoff file is the shared continuity layer.",
  "Before continuing, reply with exactly one machine-readable line beginning KEEPITMOVIN_RECEIVED followed by a JSON object with string fields goal and next. Keep both values short. Do not wrap the line in a code block.",
  "After reading it, continue the work and keep your sections of the handoff updated after each subtask (keepitmovin maintains the mechanical sections automatically). Revise in place rather than appending."
].join("\n");
