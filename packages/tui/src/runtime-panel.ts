import type { RuntimePanelData } from "./types.js";

function formatVerifyCommands(commands?: string[] | null): string {
  if (!commands || commands.length === 0) {
    return "-";
  }

  return commands
    .map(command =>
      command.startsWith("manual:")
        ? `manual review (${command.slice("manual:".length).trim() || "manual check"})`
        : command
    )
    .join(" ;; ");
}

export function renderRuntimePanel(data: RuntimePanelData): string {
  return [
    `Phase: ${data.phase}`,
    `Flow: ${data.flow ?? "-"}`,
    `Goal: ${data.goalSummary ?? "-"}`,
    `Spec: ${data.specPath ?? "-"}`,
    `Plan: ${data.planPath ?? "-"}`,
    `Milestone: ${data.milestone ?? "-"}`,
    `Milestone text: ${data.milestoneText ?? "-"}`,
    `Milestone status: ${data.milestoneStatus ?? "-"}`,
    `Next milestone: ${data.nextMilestone ?? "-"}`,
    `Next milestone text: ${data.nextMilestoneText ?? "-"}`,
    `Milestone progress: ${data.milestoneProgress ?? "-"}`,
    `Milestone status counts: ${data.milestoneStatusCounts ?? "-"}`,
    `Task progress: ${data.taskProgress ?? "-"}`,
    `Task status counts: ${data.taskStatusCounts ?? "-"}`,
    `Task: ${data.task ?? "-"}`,
    `Task text: ${data.taskText ?? "-"}`,
    `Task status: ${data.taskStatus ?? "-"}`,
    `Task kind: ${data.taskKind ?? "-"}`,
    `Task owner: ${data.taskOwner ?? "-"}`,
    `Expected output: ${data.expectedOutput ?? "-"}`,
    `Task output: ${data.taskOutputPath ?? "-"}`,
    `Provider: ${data.provider ?? "-"}`,
    `Model: ${data.modelId ?? "-"}`,
    `Temperature: ${data.modelTemperature ?? "-"}`,
    `Max tokens: ${data.modelMaxTokens ?? "-"}`,
    `Execution mode: ${data.executionMode ?? "-"}`,
    `Verify cmd: ${formatVerifyCommands(data.verifyCommand)}`,
    `Recovery hint: ${data.recoveryHint ?? "-"}`,
    `Verification status: ${data.verificationStatus ?? "-"}`,
    `Verification: ${data.verification ?? "-"}`,
    `Handoff: ${data.handoff ?? "-"}`,
    `Handoff eligible: ${data.handoffEligible === undefined ? "-" : data.handoffEligible ? "yes" : "no"}`,
    `Handoff reason: ${data.handoffReason ?? "-"}`,
    `Blocker: ${data.blocker ?? "-"}`,
    `Resume target: ${data.resumePhase ?? "-"}`,
    `Ready tasks: ${data.readyTasks && data.readyTasks.length > 0 ? data.readyTasks.join(" | ") : "-"}`,
    `Pending dependencies: ${
      data.pendingDependencies && data.pendingDependencies.length > 0
        ? data.pendingDependencies.join(" | ")
        : "-"
    }`,
    `Allowed tools: ${data.allowedTools && data.allowedTools.length > 0 ? data.allowedTools.join(", ") : "-"}`,
    `Recent artifacts: ${data.recentArtifactSummary ?? "-"}`,
    `Next: ${data.nextAction ?? "-"}`
  ].join("\n");
}
