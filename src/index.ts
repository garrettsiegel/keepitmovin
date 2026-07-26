export { defaultConfig, initConfig, loadConfig, keepitmovinConfigSchema } from "./config.js";
export { runDoctor } from "./doctor.js";
export { classifyError } from "./errors.js";
export {
  appendHandoffCheckpoint,
  archiveHandoffFile,
  buildProviderHandoffPrompt,
  buildSessionPrompt,
  clearHandoffArtifacts,
  createHandoffFile,
  getHandoffPaths,
  summarizeHandoffFile
} from "./handoff-file.js";
export { runHarness } from "./harness.js";
export { addExecutableBits, ensurePtyHelperExecutable } from "./pty-helper.js";
export { renderInteractiveLaunch } from "./interactive-provider.js";
export {
  applyRouteToLaunch,
  CLAUDE_ROUTE_PROFILES,
  CODEX_ROUTE_PROFILES,
  readCodexModels,
  resolveProviderRoute
} from "./model-routing.js";
export { classifyTask, escalateTier, overrideTier } from "./routing.js";
export { readLatestSessionLog, readRecentSessionLogs, writeSessionLog } from "./session-log.js";
export { applyProviderOrder, applyRoutingPreference, getSetupState, runSetupWizard } from "./setup.js";
export { isRoutingRequested, resolveRouteForLaunch, resolveTaskForLaunch } from "./launch-routing.js";
export { RollingTranscript } from "./transcript.js";
export {
  createHandoffReceiptTracker,
  HANDOFF_RECEIPT_PREFIX,
  HANDOFF_RECEIPT_TIMEOUT_MS,
  parseHandoffReceiptLine
} from "./handoff-receipt.js";
export {
  buildNudgeMessage,
  buildCompactionNudgeMessage,
  getHandoffNarrativeSnapshot,
  refreshHandoffFile,
  replaceSection,
  startHandoffWatcher
} from "./handoff-refresh.js";
export { resolveCompactionProbeDir, startCompactionProbe } from "./compaction-probe.js";
export type { CompactionProbeOptions } from "./compaction-probe.js";
export { createWatchdogTracker } from "./watchdog.js";
export { startWatchdogProgressProbe } from "./watchdog-progress.js";
export { createKeepitmovinMcpServer, serveKeepitmovinMcp } from "./mcp-server.js";
export { readMcpHandoff, readMcpSessionSummaries } from "./mcp-data.js";
export { changeMcpInstallations, resolveMcpServerCommand } from "./mcp-installer.js";
export { getMcpClientStatuses, MCP_CLIENTS } from "./mcp-clients.js";
export {
  checkUsageThreshold,
  formatUsageProbeMessage,
  readCodexUsage,
  readProviderUsage,
  resolveUsageProbe,
  startUsageProbe
} from "./usage-probe.js";
export type { ResolvedUsageProbe, UsageProbeOptions, UsageSnapshot } from "./usage-probe.js";
export { ensureProviderFreshness } from "./updates.js";
export {
  formatChangedFiles,
  formatGitSnapshot,
  getChangedFiles,
  getGitContext,
  getGitRoot,
  getGitSnapshot,
  isGitRepo
} from "./git.js";
export {
  getCatalogEntry,
  getDefaultInteractiveProviders,
  getDefaultProviderOrder,
  getProviderCatalog,
  isCatalogHarnessProvider,
  isHarnessControllable,
  isHiddenCatalogEntry,
  isHiddenProviderName,
  mergeCatalogInteractiveProviders,
  PROVIDER_CATALOG,
  reconcileProviderOrder
} from "./provider-catalog.js";
// Previously absent from the barrel even though they are the pieces a consumer
// most plausibly needs: the live detector, the redactor applied to every
// persisted artifact, the recursive-delete guard, and config save/trust.
export { detectLiveFailure, detectExitFailure } from "./failure-detection.js";
export { redactSecrets } from "./redact.js";
export { isSafeToRecursivelyDelete, isStrictlyInside, resolveFromCwd } from "./paths.js";
export { assessHandoffQuality } from "./handoff-quality.js";

export type {
  AgentErrorType,
  AppliedRoute,
  GitContext,
  HandoffQuality,
  HandoffReceiptLog,
  CompactionEventLog,
  WatchdogEventLog,
  ProviderIntegrationType,
  ProviderName,
  ReasoningEffort,
  RouteDecision,
  RoutingTier,
  SessionOutcome,
  KeepitmovinConfig,
  CompactionProbeSpec,
  UsageProbeKind,
  UsageProbeSpec
} from "./types.js";
