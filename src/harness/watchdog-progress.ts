import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getGitSnapshot } from "../util/git.js";
import { getHandoffNarrativeSnapshot } from "../handoff/refresh.js";

const signature = async (cwd: string, handoffPath: string): Promise<string> => {
  const [git, handoff] = await Promise.all([
    getGitSnapshot(cwd),
    readFile(handoffPath, "utf8").catch(() => "")
  ]);
  return createHash("sha256")
    .update(git.statusShort)
    .update("\u0000")
    .update(git.diffStat)
    .update("\u0000")
    .update(getHandoffNarrativeSnapshot(handoff))
    .digest("hex");
};

export const startWatchdogProgressProbe = (options: {
  cwd: string;
  handoffPath: string;
  onProgress: () => void;
  intervalMs?: number;
}): (() => void) => {
  let previous: string | undefined;
  let stopped = false;
  let inFlight = false;
  const poll = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const current = await signature(options.cwd, options.handoffPath);
      if (previous !== undefined && current !== previous) options.onProgress();
      previous = current;
    } finally {
      inFlight = false;
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), options.intervalMs ?? 30_000);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
};
