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

export function formatStatusLine(input: {
  phase: string;
  flow?: string;
  goalSummary?: string | null;
  specPath?: string | null;
  planPath?: string | null;
  milestone?: string | null;
  milestoneText?: string | null;
  milestoneStatus?: string | null;
  nextMilestone?: string | null;
  nextMilestoneText?: string | null;
  milestoneProgress?: string | null;
  milestoneStatusCounts?: string | null;
  taskProgress?: string | null;
  taskStatusCounts?: string | null;
  task?: string | null;
  taskText?: string | null;
  taskStatus?: string | null;
  taskKind?: string | null;
  taskOwner?: string | null;
  expectedOutput?: string | null;
  taskOutputPath?: string | null;
  provider?: string | null;
  modelId?: string | null;
  modelTemperature?: number | null;
  modelMaxTokens?: number | null;
  executionMode?: string | null;
  verifyCommand?: string[] | null;
  recoveryHint?: string | null;
  verificationStatus?: string | null;
  verification?: string | null;
  handoff?: string | null;
  blocker?: string | null;
  readyTasks?: string[] | null;
  pendingDependencies?: string[] | null;
  allowedTools?: string[] | null;
  nextAction?: string;
}): string {
  return [
    `Phase: ${input.phase}`,
    `Flow: ${input.flow ?? "-"}`,
    `Goal: ${input.goalSummary ?? "-"}`,
    `Spec: ${input.specPath ?? "-"}`,
    `Plan: ${input.planPath ?? "-"}`,
    `Milestone: ${input.milestone ?? "-"}`,
    `Milestone text: ${input.milestoneText ?? "-"}`,
    `Milestone status: ${input.milestoneStatus ?? "-"}`,
    `Next milestone: ${input.nextMilestone ?? "-"}`,
    `Next milestone text: ${input.nextMilestoneText ?? "-"}`,
    `Milestone progress: ${input.milestoneProgress ?? "-"}`,
    `Milestone status counts: ${input.milestoneStatusCounts ?? "-"}`,
    `Task progress: ${input.taskProgress ?? "-"}`,
    `Task status counts: ${input.taskStatusCounts ?? "-"}`,
    `Task: ${input.task ?? "-"}`,
    `Task text: ${input.taskText ?? "-"}`,
    `Task status: ${input.taskStatus ?? "-"}`,
    `Task kind: ${input.taskKind ?? "-"}`,
    `Task owner: ${input.taskOwner ?? "-"}`,
    `Expected output: ${input.expectedOutput ?? "-"}`,
    `Task output: ${input.taskOutputPath ?? "-"}`,
    `Provider: ${input.provider ?? "-"}`,
    `Model: ${input.modelId ?? "-"}`,
    `Temperature: ${input.modelTemperature ?? "-"}`,
    `Max tokens: ${input.modelMaxTokens ?? "-"}`,
    `Execution mode: ${input.executionMode ?? "-"}`,
    `Verify cmd: ${formatVerifyCommands(input.verifyCommand)}`,
    `Recovery hint: ${input.recoveryHint ?? "-"}`,
    `Verification status: ${input.verificationStatus ?? "-"}`,
    `Verification: ${input.verification ?? "-"}`,
    `Handoff: ${input.handoff ?? "-"}`,
    `Blocker: ${input.blocker ?? "-"}`,
    `Ready tasks: ${input.readyTasks && input.readyTasks.length > 0 ? input.readyTasks.join(" | ") : "-"}`,
    `Pending dependencies: ${
      input.pendingDependencies && input.pendingDependencies.length > 0
        ? input.pendingDependencies.join(" | ")
        : "-"
    }`,
    `Allowed tools: ${input.allowedTools && input.allowedTools.length > 0 ? input.allowedTools.join(", ") : "-"}`,
    `Next: ${input.nextAction ?? "-"}`
  ].join("\n");
}
