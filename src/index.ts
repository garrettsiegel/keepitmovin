export { defaultConfig, loadConfig, saveConfig, keepitmovinConfigSchema } from "./config/index.js";
export { runDoctor } from "./doctor.js";
export { classifyError } from "./detection/errors.js";
export {
  appendHandoffCheckpoint,
  archiveHandoffFile,
  buildProviderHandoffPrompt,
  buildSessionPrompt,
  clearHandoffArtifacts,
  createHandoffFile,
  getHandoffPaths,
  summarizeHandoffFile
} from "./handoff/file.js";
export { runHarness } from "./harness/index.js";
export { addExecutableBits, ensurePtyHelperExecutable } from "./pty/helper.js";
export { renderInteractiveLaunch } from "./providers/interactive.js";
export {
  applyRouteToLaunch,
  CLAUDE_ROUTE_PROFILES,
  CODEX_ROUTE_PROFILES,
  readCodexModels,
  resolveProviderRoute
} from "./routing/model.js";
export { classifyTask, escalateTier, overrideTier } from "./routing/classify.js";
export { readLatestSessionLog, readRecentSessionLogs, writeSessionLog } from "./session/log.js";
export { applyProviderOrder, applyRoutingPreference, getSetupState, runSetupWizard } from "./setup/index.js";
export { isRoutingRequested, resolveRouteForLaunch, resolveTaskForLaunch } from "./routing/launch.js";
export { RollingTranscript } from "./harness/transcript.js";
export {
  createHandoffReceiptTracker,
  HANDOFF_RECEIPT_PREFIX,
  HANDOFF_RECEIPT_TIMEOUT_MS,
  parseHandoffReceiptLine
} from "./handoff/receipt.js";
export {
  buildNudgeMessage,
  buildCompactionNudgeMessage,
  getHandoffNarrativeSnapshot,
  refreshHandoffFile,
  replaceSection,
  startHandoffWatcher
} from "./handoff/refresh.js";
export { resolveCompactionProbeDir, startCompactionProbe } from "./probes/compaction.js";
export type { CompactionProbeOptions } from "./probes/compaction.js";
export { createWatchdogTracker } from "./harness/watchdog.js";
export { startWatchdogProgressProbe } from "./harness/watchdog-progress.js";
export { createKeepitmovinMcpServer, serveKeepitmovinMcp } from "./mcp/server.js";
export { readMcpHandoff, readMcpSessionSummaries } from "./mcp/data.js";
export { changeMcpInstallations, resolveMcpServerCommand } from "./mcp/installer.js";
export { getMcpClientStatuses, MCP_CLIENTS } from "./mcp/clients.js";
export {
  checkUsageThreshold,
  formatUsageProbeMessage,
  readCodexUsage,
  readProviderUsage,
  resolveUsageProbe,
  startUsageProbe
} from "./probes/usage.js";
export type { ResolvedUsageProbe, UsageProbeOptions, UsageSnapshot } from "./probes/usage.js";
export { ensureProviderFreshness } from "./setup/updates.js";
export {
  formatChangedFiles,
  formatGitSnapshot,
  getChangedFiles,
  getGitContext,
  getGitRoot,
  getGitSnapshot,
  isGitRepo
} from "./util/git.js";
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
} from "./providers/catalog.js";
// Previously absent from the barrel even though they are the pieces a consumer
// most plausibly needs: the live detector, the redactor applied to every
// persisted artifact, the recursive-delete guard, and config save/trust.
export { detectLiveFailure, detectExitFailure } from "./detection/failure-detection.js";
export { redactSecrets } from "./util/redact.js";
export { isSafeToRecursivelyDelete, isStrictlyInside, resolveFromCwd } from "./util/paths.js";
export { assessHandoffQuality } from "./handoff/quality.js";

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
} from "./config/types.js";
