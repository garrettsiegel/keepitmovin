import { readFile, stat } from "node:fs/promises";
import { formatChangedFiles, formatGitSnapshot, getChangedFiles, getGitSnapshot } from "./git.js";
import { redactSecrets } from "./redact.js";
import type { KeepitmovinConfig } from "./types.js";
import { writeFileAtomic } from "./paths.js";

export const SWITCH_HISTORY_LIMIT = 10;
export const TRANSCRIPT_EXCERPT_LIMIT = 1_500;

// Agent-owned narrative sections. Staleness for the nudge is measured against
// changes to THESE, not the file mtime — keepitmovin's own mechanical refresh
// writes the file every interval, so mtime is never a reliable "stale" signal.
const NARRATIVE_SECTIONS = [
  "Current Goal",
  "Working State",
  "Commands And Checks",
  "Blockers",
  "Next Step"
];

// Returns the lines between `## <heading>` (exact match) and the next `## ` line
// (or EOF), joined. Empty string when the heading is absent.
const extractSectionBody = (content: string, heading: string): string => {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    return "";
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("## ")) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
};

// Replaces the body of `## <heading>` (exact match) up to the next `## ` line
// (or EOF). Appends the section at the end when the heading is missing. Every
// other byte of `content` is preserved.
export const replaceSection = (content: string, heading: string, body: string): string => {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  const section = [`## ${heading}`, "", body, ""];
  if (start === -1) {
    const trimmed = content.endsWith("\n") ? content.slice(0, -1) : content;
    return `${trimmed}\n\n${section.join("\n")}`;
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("## ")) {
      end = index;
      break;
    }
  }
  return [...lines.slice(0, start), ...section, ...lines.slice(end)].join("\n");
};

// Appends one line to `## Switch History`, keeping only the newest `keep`
// entries (a history entry is a line starting with "- ").
export const appendSwitchHistoryLine = (content: string, line: string, keep = SWITCH_HISTORY_LIMIT): string => {
  const entries = extractSectionBody(content, "Switch History")
    .split("\n")
    .filter((entry) => entry.trim().startsWith("- "));
  entries.push(line);
  return replaceSection(content, "Switch History", entries.slice(-keep).join("\n"));
};

const trimSwitchHistory = (content: string, keep: number): string => {
  const entries = extractSectionBody(content, "Switch History")
    .split("\n")
    .filter((entry) => entry.trim().startsWith("- "));
  if (entries.length <= keep) {
    return content;
  }
  return replaceSection(content, "Switch History", entries.slice(-keep).join("\n"));
};

// Rewrites the keepitmovin-managed mechanical sections in place (Changed Files,
// Repository Snapshot) and trims Switch History. Race guard: skips the write
// when the file's mtime changed between read and the git work (the agent just
// wrote — it's fresh). All failures resolve to false. Never throws.
export const refreshHandoffFile = async (
  cwd: string,
  config: KeepitmovinConfig,
  handoffPath: string
): Promise<boolean> => {
  try {
    let content = await readFile(handoffPath, "utf8");
    const mtimeBefore = (await stat(handoffPath)).mtimeMs;

    const [gitContext, changedFiles] = await Promise.all([
      getGitSnapshot(cwd),
      getChangedFiles(cwd)
    ]);

    if ((await stat(handoffPath)).mtimeMs !== mtimeBefore) {
      return false; // Agent wrote during our git work — leave its version alone.
    }

    content = replaceSection(
      content,
      "Changed Files",
      formatChangedFiles(changedFiles)
    );
    content = replaceSection(
      content,
      "Repository Snapshot",
      [
        `Last refreshed: ${new Date().toISOString()}`,
        "",
        "```txt",
        redactSecrets(formatGitSnapshot(gitContext)),
        "```"
      ].join("\n")
    );
    content = trimSwitchHistory(content, SWITCH_HISTORY_LIMIT);

    await writeFileAtomic(handoffPath, content);
    return true;
  } catch {
    return false;
  }
};

export const buildNudgeMessage = (handoffPath: string): string =>
  `Please update the keepitmovin handoff file now (${handoffPath}): revise Current Goal, ` +
  `Working State, Commands And Checks, Blockers, and Next Step in place. ` +
  `keepitmovin maintains the other sections automatically.\n`;

export const buildCompactionNudgeMessage = (handoffPath: string): string =>
  `keepitmovin detected that this tool compacted its context. Re-read ${handoffPath}, ` +
  "then revise Working State, Commands And Checks, Blockers, and Next Step before continuing.\n";

export interface HandoffWatcherContext {
  cwd: string;
  config: KeepitmovinConfig;
  handoffPath: string;
  transcriptLength: () => number; // RollingTranscript text().length
  lastActivityAt: () => number; // epoch ms of last child output OR user input
  isSettled: () => boolean;
  writeToChild: (text: string) => void;
}

export const getHandoffNarrativeSnapshot = (content: string): string =>
  NARRATIVE_SECTIONS.map((heading) => extractSectionBody(content, heading)).join("\u0000");

// One interval doing both jobs: refresh the mechanical sections, then nudge the
// tool when the narrative has gone stale while it kept working. Returns stop().
export const startHandoffWatcher = (ctx: HandoffWatcherContext): (() => void) => {
  const settings = ctx.config.harness.handoffRefresh;
  if (!settings.enabled) {
    return () => {};
  }

  let inFlight = false;
  let stopped = false;
  let lastNudgeAt = 0;
  let transcriptBaseline = ctx.transcriptLength();
  let lastNarrative: string | undefined;
  let narrativeChangedAt = Date.now();

  const maybeNudge = async (): Promise<void> => {
    const nudge = settings.nudge;
    if (!nudge.enabled) {
      return;
    }

    let content: string;
    try {
      content = await readFile(ctx.handoffPath, "utf8");
    } catch {
      return; // No handoff file yet.
    }

    // Track when the agent last touched its own sections (mechanical refreshes
    // never change these, so this is the true narrative-staleness clock).
    const snapshot = getHandoffNarrativeSnapshot(content);
    if (lastNarrative === undefined) {
      lastNarrative = snapshot;
    } else if (snapshot !== lastNarrative) {
      lastNarrative = snapshot;
      narrativeChangedAt = Date.now();
      transcriptBaseline = ctx.transcriptLength();
    }

    const now = Date.now();
    const stale = now - narrativeChangedAt >= nudge.staleAfterMs;
    const grew = ctx.transcriptLength() - transcriptBaseline >= nudge.minTranscriptGrowthChars;
    const idle = now - ctx.lastActivityAt() >= nudge.idleForMs;
    const cooledDown = now - lastNudgeAt >= nudge.staleAfterMs;
    if (!stale || !grew || !idle || !cooledDown) {
      return;
    }

    ctx.writeToChild(buildNudgeMessage(ctx.handoffPath));
    lastNudgeAt = now;
    transcriptBaseline = ctx.transcriptLength();
  };

  const timer = setInterval(() => {
    if (inFlight || stopped || ctx.isSettled()) {
      return;
    }
    inFlight = true;
    void refreshHandoffFile(ctx.cwd, ctx.config, ctx.handoffPath)
      .then(() => maybeNudge())
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  }, settings.intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
};
