import type { RouteDecision, RoutingTier } from "../config/types.js";

export interface RouteInput {
  task: string;
  changedFiles?: string[];
  repeatedFailures?: number;
}

const TIER_ORDER: RoutingTier[] = ["light", "standard", "deep", "max"];

const has = (value: string, patterns: RegExp[]): boolean => patterns.some((pattern) => pattern.test(value));

const splitTasks = (task: string): string[] => {
  const normalized = task.trim();
  if (!normalized) {
    return [""];
  }

  const numbered = normalized.split("\n").filter((line) => /^\s*\d+[.)]\s+/.test(line));
  if (numbered.length >= 2) {
    return numbered;
  }
  return normalized.split(/\s+(?:and then|also)\s+|;\s+/i).filter(Boolean);
};

const classifyOne = (task: string, changedFiles: string[]): RouteDecision => {
  const text = task.toLowerCase();
  const files = changedFiles.join(" ").toLowerCase();
  const signals: string[] = [];

  if (has(text, [
    /\blong[- ]horizon\b/, /\bwhole[- ]repo(?:sitory)?\b/, /\bentire (?:codebase|repository|system)\b/,
    /\bautonomous(?:ly)?\b/, /\bhardest unsolved\b/
  ])) {
    const reason = "long-horizon or whole-repository scope";
    signals.push(reason);
    return { tier: "max", reason, signals, source: "classifier" };
  }

  if (has(`${text} ${files}`, [
    /\b(?:architect|architecture|design|root cause|investigate|unknown cause|figure out)\b/,
    /\b(?:security|authentication|authorization|payment|billing|migration|concurrency|race condition)\b/,
    /(?:^|\/)migrations?(?:\/|\.|$)/, /(?:^|\/)(?:auth|security|billing)(?:\/|\.|$)/
  ])) {
    const reason = "architecture, unknown-cause debugging, or high-risk domain";
    signals.push(reason);
    return { tier: "deep", reason, signals, source: "classifier" };
  }

  const settled = has(text, [
    /\bimplement (?:the |this )?(?:approved |written )?plan\b/,
    /\bfollow (?:the |this )?(?:approved |written )?plan\b/,
    /\bknown (?:repro|reproduction)\b/
  ]);
  if (settled) {
    const reason = "settled plan or known reproduction";
    signals.push(reason);
    return { tier: "standard", reason, signals, source: "classifier" };
  }

  const mechanical = has(text, [
    /\brename\b/, /\btypo\b/, /\bformat(?:ting)?\b/, /\breword\b/, /\bbump (?:the )?version\b/,
    /\bchange .{1,80} to .{1,80}\b/, /\bdelete (?:the )?unused\b/, /\bcommit message\b/
  ]);
  if (mechanical) {
    const reason = "exact mechanical change";
    signals.push(reason);
    return { tier: "light", reason, signals, source: "classifier" };
  }

  const reason = "ordinary implementation or maintenance work";
  signals.push(reason);
  return { tier: "standard", reason, signals, source: "classifier" };
};

export const escalateTier = (tier: RoutingTier, levels = 1): RoutingTier =>
  TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(tier) + levels)] ?? "max";

export const classifyTask = (input: RouteInput): RouteDecision => {
  const tasks = splitTasks(input.task);
  const decisions = tasks.map((task) => classifyOne(task, input.changedFiles ?? []));
  const highest = decisions.reduce((best, decision) =>
    TIER_ORDER.indexOf(decision.tier) > TIER_ORDER.indexOf(best.tier) ? decision : best
  );
  const repeatedFailures = input.repeatedFailures ?? 0;
  const tier = repeatedFailures >= 2 ? escalateTier(highest.tier) : highest.tier;
  const signals = [
    ...highest.signals,
    ...(tasks.length > 1 ? [`${tasks.length} tasks; routed to the highest required tier`] : []),
    ...(repeatedFailures >= 2 ? ["escalated after repeated failure"] : [])
  ];

  return {
    ...highest,
    tier,
    reason: signals.at(-1) ?? highest.reason,
    signals
  };
};

export const overrideTier = (decision: RouteDecision, tier: RoutingTier): RouteDecision => ({
  tier,
  reason: `user selected ${tier} tier`,
  signals: [...decision.signals, "explicit tier override"],
  source: "tier_override"
});
