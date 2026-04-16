import type { ArtifactMeta, RuntimeStatus } from "@doo/harness-runtime";
import type { BlockedPayload, PickupPayload, QueuePayload } from "@doo/harness-runtime";
import type { DoctorPayload } from "./onboarding.js";
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
  handoff: {
    eligible: boolean;
    reason: string | null;
    path: string | null;
  };
  auto: {
    recommendedCommand: string;
    rationale: string;
  };
}

export interface LaneStatusView {
  mode: "lanes";
  phase: string;
  active: {
    taskId: string | null;
    taskText: string | null;
    owner: string | null;
    executionMode: string;
    modelId: string;
  };
  ready: Array<{
    taskId: string;
    taskText: string | null;
    owner: string | null;
    status: string | null;
  }>;
}

export interface ReadinessStatusView {
  mode: "readiness";
  phase: string;
  configReady: boolean;
  providerReady: boolean;
  handoffReady: boolean;
  recommendedCommand: string;
  doctorSummary: string;
  validationTracks: DoctorPayload["validationTracks"];
  summary: string;
}

export interface ShipStatusView {
  mode: "ship";
  phase: string;
  shipReady: boolean;
  recommendedCommand: string;
  releaseChecks: string[];
  releaseNotes: string[];
  summary: string;
}

export interface TodayStatusView {
  mode: "today";
  phase: string;
  goal: string | null;
  nextAction: string | null;
  blockerCount: number;
  reviewQueueCount: number;
  pickupKind: string;
  activeLane: LaneStatusView["active"];
  readinessRecommendedCommand: string;
  shipRecommendedCommand: string;
  summary: string;
}

function formatRecommendationSummary(command: string, reason: string): string {
  return `${command} first. ${reason}`;
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
  const auto =
    status.lastHandoffPath && (status.phase === "idle" || status.phase === "completed" || status.phase === "cancelled")
      ? {
          recommendedCommand: "harness handoff inspect",
          rationale: "preserved handoff exists and the runtime is inactive"
        }
      : status.goalSummary && status.phase !== "completed" && status.phase !== "cancelled"
        ? {
            recommendedCommand: "harness auto",
            rationale: "goal is already loaded and the runtime can continue from current state"
          }
        : {
            recommendedCommand: "harness auto <goal>",
            rationale: "no resumable goal is active, so the next autonomous move is to start one explicitly"
          };

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
    pickup,
    handoff: {
      eligible: status.handoffEligible,
      reason: status.handoffReason,
      path: status.lastHandoffPath
    },
    auto
  };
}

export function buildLaneStatusView(
  status: RuntimeStatus,
  taskState: {
    tasks: Record<string, string>;
    taskTexts: Record<string, string>;
    taskOwners: Record<string, string>;
  }
): LaneStatusView {
  const ready = Object.entries(taskState.tasks)
    .filter(([taskId, taskStatus]) => taskStatus === "todo" && taskId !== status.activeTaskId)
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId, undefined, { numeric: true }))
    .slice(0, 5)
    .map(([taskId, taskStatus]) => ({
      taskId,
      taskText: taskState.taskTexts[taskId] ?? null,
      owner: taskState.taskOwners[taskId] ?? null,
      status: taskStatus ?? null
    }));

  return {
    mode: "lanes",
    phase: status.phase,
    active: {
      taskId: status.activeTaskId,
      taskText: status.activeTaskText,
      owner: status.activeTaskOwner,
      executionMode: status.activeExecutionMode,
      modelId: status.activeModelId
    },
    ready
  };
}

export function buildReadinessStatusView(status: RuntimeStatus, doctor: DoctorPayload): ReadinessStatusView {
  const summary = formatRecommendationSummary(
    doctor.recommendedCommand,
    doctor.hasRuntimeConfig && doctor.providerReadiness.every(item => item.status === "ready")
      ? "Core setup looks usable, so the next step is validating or shipping."
      : "Readiness still depends on setup or provider fixes."
  );
  return {
    mode: "readiness",
    phase: status.phase,
    configReady: doctor.hasRuntimeConfig,
    providerReady: doctor.providerReadiness.every(item => item.status === "ready"),
    handoffReady: status.handoffEligible,
    recommendedCommand: doctor.recommendedCommand,
    doctorSummary: doctor.summary,
    validationTracks: doctor.validationTracks
    ,
    summary
  };
}

export function buildShipStatusView(readiness: ReadinessStatusView): ShipStatusView {
  const releaseTrack = readiness.validationTracks.find(track => track.kind === "release");
  const shipReady = readiness.configReady && readiness.providerReady;
  const recommendedCommand = shipReady ? "pnpm run smoke:pi:print" : readiness.recommendedCommand;
  return {
    mode: "ship",
    phase: readiness.phase,
    shipReady,
    recommendedCommand,
    releaseChecks: releaseTrack?.commands ?? [],
    releaseNotes: ["Summary", "Validation", "Risk / Follow-up"],
    summary: formatRecommendationSummary(
      recommendedCommand,
      shipReady
        ? "Release-gate checks are the next step before recording release notes."
        : "Shipping depends on readiness work first."
    )
  };
}

export function buildTodayStatusView(input: {
  status: RuntimeStatus;
  dashboard: DashboardStatusView;
  lanes: LaneStatusView;
  readiness: ReadinessStatusView;
  ship: ShipStatusView;
}): TodayStatusView {
  const summary =
    input.status.blocker
      ? formatRecommendationSummary(
          input.status.nextAction ?? input.readiness.recommendedCommand,
          "The runtime is blocked, so recovery takes priority."
        )
      : input.status.phase === "idle" || input.status.phase === "completed" || input.status.phase === "cancelled"
        ? formatRecommendationSummary(
            input.readiness.recommendedCommand,
            "The runtime is not actively progressing work, so the next setup or kickoff step comes first."
          )
        : formatRecommendationSummary(
            input.status.nextAction ?? input.readiness.recommendedCommand,
            "There is active work in progress, so the operator loop comes first."
          );
  return {
    mode: "today",
    phase: input.status.phase,
    goal: input.status.goalSummary,
    nextAction: input.status.nextAction ?? null,
    blockerCount: input.dashboard.blocked.items.length,
    reviewQueueCount: input.dashboard.reviewQueue.items.length,
    pickupKind: input.dashboard.pickup.pickupKind,
    activeLane: input.lanes.active,
    readinessRecommendedCommand: input.readiness.recommendedCommand,
    shipRecommendedCommand: input.ship.recommendedCommand,
    summary
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
    `Handoff: ${status.handoff.eligible ? "ready" : "not ready"}${status.handoff.path ? ` -> ${status.handoff.path}` : ""}`,
    `Handoff reason: ${status.handoff.reason ?? "-"}`,
    `Pickup: ${status.pickup.pickupKind}${status.pickup.target ? ` -> ${status.pickup.target}` : ""}`,
    `Auto: ${status.auto.recommendedCommand}`,
    `Auto rationale: ${status.auto.rationale}`,
    `Review queue: ${status.reviewQueue.items.length}`,
    `Blocked tasks: ${status.blocked.items.length}`,
    `Recent artifacts: ${status.recentArtifacts.length > 0 ? status.recentArtifacts.join(" | ") : "-"}`,
    `Next: ${status.nextAction ?? "-"}`
  ].join("\n");
}

export function runLaneStatus(status: LaneStatusView): string {
  return [
    "Lanes",
    `Phase: ${status.phase}`,
    `Active: ${status.active.taskId ?? "-"}${status.active.taskText ? ` ${status.active.taskText}` : ""}`,
    `Owner: ${status.active.owner ?? "-"}`,
    `Execution: ${status.active.executionMode}`,
    `Model: ${status.active.modelId}`,
    `Ready lanes: ${
      status.ready.length > 0
        ? status.ready
            .map(item => `${item.taskId}${item.taskText ? ` ${item.taskText}` : ""} [${item.owner ?? "-"}]`)
            .join(" | ")
        : "-"
    }`
  ].join("\n");
}

export function runReadinessStatus(status: ReadinessStatusView): string {
  return [
    "Readiness",
    `Phase: ${status.phase}`,
    `Config: ${status.configReady ? "ready" : "missing"}`,
    `Provider: ${status.providerReady ? "ready" : "needs attention"}`,
    `Handoff: ${status.handoffReady ? "ready" : "not ready"}`,
    `Recommended: ${status.recommendedCommand}`,
    `Summary: ${status.summary}`,
    `Doctor: ${status.doctorSummary}`,
    "Validation tracks:",
    ...status.validationTracks.flatMap(track => [`- ${track.kind}: ${track.summary}`, ...track.commands.map(command => `  - ${command}`)])
  ].join("\n");
}

export function runShipStatus(status: ShipStatusView): string {
  return [
    "Ship",
    `Phase: ${status.phase}`,
    `Ready: ${status.shipReady ? "yes" : "no"}`,
    `Recommended: ${status.recommendedCommand}`,
    `Summary: ${status.summary}`,
    "Release checks:",
    ...(status.releaseChecks.length > 0 ? status.releaseChecks.map(command => `- ${command}`) : ["- (none)"]),
    "Release note sections:",
    ...status.releaseNotes.map(section => `- ${section}`)
  ].join("\n");
}

export function runTodayStatus(status: TodayStatusView): string {
  return [
    "Today",
    `Phase: ${status.phase}`,
    `Goal: ${status.goal ?? "-"}`,
    `Next: ${status.nextAction ?? "-"}`,
    `Summary: ${status.summary}`,
    `Blocked count: ${status.blockerCount}`,
    `Review queue: ${status.reviewQueueCount}`,
    `Pickup: ${status.pickupKind}`,
    `Active lane: ${status.activeLane.taskId ?? "-"}${status.activeLane.taskText ? ` ${status.activeLane.taskText}` : ""}`,
    `Lane owner: ${status.activeLane.owner ?? "-"}`,
    `Lane execution: ${status.activeLane.executionMode}`,
    `Readiness: ${status.readinessRecommendedCommand}`,
    `Ship: ${status.shipRecommendedCommand}`
  ].join("\n");
}
