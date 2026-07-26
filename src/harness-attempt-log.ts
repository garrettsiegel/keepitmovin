import type {
  AppliedRoute,
  HarnessAttemptLog,
  InteractiveProviderConfig
} from "./types.js";

/** The parts of an attempt log that are identical however the attempt ended. */
export interface AttemptLogBase {
  provider: InteractiveProviderConfig;
  command: string;
  args: string[];
  startedAt: string;
  route?: AppliedRoute;
}

/**
 * Builds a `HarnessAttemptLog`.
 *
 * This shape was hand-constructed in three places — the pre-flight usage probe,
 * the spawn-failure path, and the normal exit path — with field sets that had
 * already drifted apart (`handoffReceipt` in two of them, `errorDetail` in two).
 * Routing every attempt through one builder keeps them consistent, and keeps the
 * optional-field spreads in a single place.
 */
export const buildAttemptLog = (
  base: AttemptLogBase,
  outcome: Omit<HarnessAttemptLog, "provider" | "label" | "command" | "args" | "startedAt" | "endedAt" | "route"> & {
    endedAt?: string;
  }
): HarnessAttemptLog => {
  const { endedAt, ...rest } = outcome;

  return {
    provider: base.provider.name,
    label: base.provider.label,
    command: base.command,
    args: base.args,
    startedAt: base.startedAt,
    endedAt: endedAt ?? new Date().toISOString(),
    ...rest,
    ...(base.route ? { route: base.route } : {})
  };
};
