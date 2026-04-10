import type { RuntimeStatus } from "@doo/harness-runtime";
import { formatStatusLine } from "../../output.js";

export function runStatus(status: RuntimeStatus): string {
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
    blocker: status.blocker,
    readyTasks: status.readyTasks,
    pendingDependencies: status.pendingDependencies,
    allowedTools: status.allowedTools,
    nextAction: status.nextAction
  });
}
