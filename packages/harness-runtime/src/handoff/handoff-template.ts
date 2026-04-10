export function renderHandoffTemplate(input: {
  goal: string | null;
  phase: string;
  activeSpecPath: string | null;
  activePlanPath: string | null;
  activeMilestoneId: string | null;
  activeMilestoneText: string | null;
  activeMilestoneStatus: string | null;
  nextMilestoneId: string | null;
  nextMilestoneText: string | null;
  milestoneProgress: string;
  milestoneStatusCounts: string;
  taskProgress: string;
  taskStatusCounts: string;
  activeTaskId: string | null;
  activeTaskText: string | null;
  activeTaskStatus: string | null;
  activeTaskKind: string | null;
  activeTaskOwner: string | null;
  activeTaskExpectedOutput: string | null;
  activeTaskOutputPath: string | null;
  activeProvider: string;
  activeModelId: string;
  activeModelTemperature: number | null;
  activeModelMaxTokens: number | null;
  activeExecutionMode: string;
  lastVerificationStatus: string | null;
  activeTaskRecoveryHint: string | null;
  readyTasks: string[];
  pendingDependencies: string[];
  allowedTools: string[];
  artifactPaths: string[];
  nextStep: string;
  verificationPath: string | null;
  blocker: string | null;
}): string {
  return [
    "# Handoff",
    "",
    "## Goal",
    input.goal ?? "(not set)",
    "",
    "## Current Phase",
    input.phase,
    "",
    "## Spec",
    input.activeSpecPath ?? "(none)",
    "",
    "## Plan",
    input.activePlanPath ?? "(none)",
    "",
    "## Active Milestone",
    input.activeMilestoneId ?? "(none)",
    "",
    "## Active Milestone Text",
    input.activeMilestoneText ?? "(none)",
    "",
    "## Active Milestone Status",
    input.activeMilestoneStatus ?? "(none)",
    "",
    "## Next Milestone",
    input.nextMilestoneId ?? "(none)",
    "",
    "## Next Milestone Text",
    input.nextMilestoneText ?? "(none)",
    "",
    "## Milestone Progress",
    input.milestoneProgress,
    "",
    "## Milestone Status Counts",
    input.milestoneStatusCounts,
    "",
    "## Task Progress",
    input.taskProgress,
    "",
    "## Task Status Counts",
    input.taskStatusCounts,
    "",
    "## Active Task",
    input.activeTaskId ?? "(none)",
    "",
    "## Task Text",
    input.activeTaskText ?? "(none)",
    "",
    "## Task Status",
    input.activeTaskStatus ?? "(none)",
    "",
    "## Task Kind",
    input.activeTaskKind ?? "(none)",
    "",
    "## Task Owner",
    input.activeTaskOwner ?? "(none)",
    "",
    "## Expected Output",
    input.activeTaskExpectedOutput ?? "(none)",
    "",
    "## Task Output",
    input.activeTaskOutputPath ?? "(none)",
    "",
    "## Provider",
    input.activeProvider,
    "",
    "## Model",
    input.activeModelId,
    "",
    "## Temperature",
    input.activeModelTemperature === null ? "(none)" : String(input.activeModelTemperature),
    "",
    "## Max Tokens",
    input.activeModelMaxTokens === null ? "(none)" : String(input.activeModelMaxTokens),
    "",
    "## Execution Mode",
    input.activeExecutionMode,
    "",
    "## Verification Status",
    input.lastVerificationStatus ?? "(none)",
    "",
    "## Recovery Hint",
    input.activeTaskRecoveryHint ?? "(none)",
    "",
    "## Ready Tasks",
    ...(input.readyTasks.length === 0 ? ["- (none)"] : input.readyTasks.map(item => `- ${item}`)),
    "",
    "## Pending Dependencies",
    ...(input.pendingDependencies.length === 0 ? ["- (none)"] : input.pendingDependencies.map(item => `- ${item}`)),
    "",
    "## Allowed Tools",
    ...(input.allowedTools.length === 0 ? ["- (none)"] : input.allowedTools.map(item => `- ${item}`)),
    "",
    "## Artifacts",
    ...(input.artifactPaths.length === 0 ? ["- (none)"] : input.artifactPaths.map(path => `- ${path}`)),
    "",
    "## Verification Path",
    input.verificationPath ?? "(none)",
    "",
    "## Blocker",
    input.blocker ?? "(none)",
    "",
    "## Exact Next Step",
    input.nextStep
  ].join("\n");
}
