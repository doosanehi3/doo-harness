import type { ArtifactMeta, RuntimeStatus } from "@doo/harness-runtime";
import type { BlockedPayload, PickupPayload, QueuePayload } from "@doo/harness-runtime";
import { formatStatusLine } from "../../output.js";

export interface StatusView extends RuntimeStatus {
  recentArtifacts: string[];
  recentArtifactSummary: string | null;
}

export interface CompactStatusView {
  compact: true;
  phase: string;
  activeTaskId: string | null;
  activeTaskText: string | null;
  lastVerificationStatus: string | null;
  blocker: string | null;
  handoffEligible: boolean;
  handoffReason: string | null;
  nextAction: string | null;
  recentArtifacts: string[];
}

export interface DashboardStatusView {
  mode: "dashboard";
  phase: string;
  activeTaskId: string | null;
  activeTaskText: string | null;
  blocker: string | null;
  lastVerificationStatus: string | null;
  nextAction: string | null;
  recentArtifacts: string[];
  blocked: BlockedPayload;
  reviewQueue: QueuePayload;
  pickup: PickupPayload;
}

function selectRecentArtifacts(artifacts: ArtifactMeta[], limit: number = 3): string[] {
  return [...artifacts]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map(item => `${item.type}: ${item.path}`);
}

export function buildStatusView(status: RuntimeStatus, artifacts: ArtifactMeta[]): StatusView {
  const recentArtifacts = selectRecentArtifacts(artifacts);
  return {
    ...status,
    recentArtifacts,
    recentArtifactSummary: recentArtifacts.length > 0 ? recentArtifacts.join(" | ") : null
  };
}

export function buildCompactStatusView(status: RuntimeStatus, artifacts: ArtifactMeta[]): CompactStatusView {
  return {
    compact: true,
    phase: status.phase,
    activeTaskId: status.activeTaskId,
    activeTaskText: status.activeTaskText,
    lastVerificationStatus: status.lastVerificationStatus,
    blocker: status.blocker,
    handoffEligible: status.handoffEligible,
    handoffReason: status.handoffReason,
    nextAction: status.nextAction ?? null,
    recentArtifacts: selectRecentArtifacts(artifacts)
  };
}

export function buildDashboardStatusView(
  status: RuntimeStatus,
  artifacts: ArtifactMeta[],
  blocked: BlockedPayload,
  reviewQueue: QueuePayload,
  pickup: PickupPayload
): DashboardStatusView {
  return {
    mode: "dashboard",
    phase: status.phase,
    activeTaskId: status.activeTaskId,
    activeTaskText: status.activeTaskText,
    blocker: status.blocker,
    lastVerificationStatus: status.lastVerificationStatus,
    nextAction: status.nextAction ?? null,
    recentArtifacts: selectRecentArtifacts(artifacts, 5),
    blocked,
    reviewQueue,
    pickup
  };
}

export function runStatus(status: StatusView): string {
  return formatStatusLine({
    phase: status.phase,
    flow: status.flow,
    goalSummary: status.goalSummary,
    specPath: status.activeSpecPath,
    planPath: status.activePlanPath,
    milestone: status.activeMilestoneId,
    milestoneText: status.activeMilestoneText,
    milestoneStatus: status.activeMilestoneStatus,
    nextMilestone: status.nextMilestoneId,
    nextMilestoneText: status.nextMilestoneText,
    milestoneProgress: status.milestoneProgress,
    milestoneStatusCounts: status.milestoneStatusCounts,
    taskProgress: status.taskProgress,
    taskStatusCounts: status.taskStatusCounts,
    task: status.activeTaskId,
    taskText: status.activeTaskText,
    taskStatus: status.activeTaskStatus,
    taskKind: status.activeTaskKind,
    taskOwner: status.activeTaskOwner,
    expectedOutput: status.activeTaskExpectedOutput,
    taskOutputPath: status.activeTaskOutputPath,
    provider: status.activeProvider,
    modelId: status.activeModelId,
    modelTemperature: status.activeModelTemperature,
    modelMaxTokens: status.activeModelMaxTokens,
    executionMode: status.activeExecutionMode,
    verifyCommand: status.activeTaskVerifyCommand,
    recoveryHint: status.activeTaskRecoveryHint,
    verificationStatus: status.lastVerificationStatus,
    verification: status.lastVerificationPath,
    handoff: status.lastHandoffPath,
    handoffEligible: status.handoffEligible,
    handoffReason: status.handoffReason,
    blocker: status.blocker,
    resumePhase: status.resumePhase,
    readyTasks: status.readyTasks,
    pendingDependencies: status.pendingDependencies,
    allowedTools: status.allowedTools,
    recentArtifactSummary: status.recentArtifactSummary,
    nextAction: status.nextAction
  });
}

export function runCompactStatus(status: CompactStatusView): string {
  return [
    "Status",
    `Phase: ${status.phase}`,
    `Task: ${status.activeTaskId ?? "-"}${status.activeTaskText ? ` ${status.activeTaskText}` : ""}`,
    `Verification: ${status.lastVerificationStatus ?? "-"}`,
    `Blocker: ${status.blocker ?? "-"}`,
    `Handoff: ${status.handoffEligible ? "ready" : "not ready"}`,
    `Handoff reason: ${status.handoffReason ?? "-"}`,
    `Recent artifacts: ${status.recentArtifacts.length > 0 ? status.recentArtifacts.join(" | ") : "-"}`,
    `Next: ${status.nextAction ?? "-"}`
  ].join("\n");
}

export function runDashboardStatus(status: DashboardStatusView): string {
  return [
    "Dashboard",
    `Phase: ${status.phase}`,
    `Task: ${status.activeTaskId ?? "-"}${status.activeTaskText ? ` ${status.activeTaskText}` : ""}`,
    `Verification: ${status.lastVerificationStatus ?? "-"}`,
    `Blocker: ${status.blocker ?? "-"}`,
    `Pickup: ${status.pickup.pickupKind}${status.pickup.target ? ` -> ${status.pickup.target}` : ""}`,
    `Review queue: ${status.reviewQueue.items.length}`,
    `Blocked tasks: ${status.blocked.items.length}`,
    `Recent artifacts: ${status.recentArtifacts.length > 0 ? status.recentArtifacts.join(" | ") : "-"}`,
    `Next: ${status.nextAction ?? "-"}`
  ].join("\n");
}
