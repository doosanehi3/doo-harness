export interface TaskContextInput {
  goalSummary: string | null;
  activePlanPath: string | null;
  activePlanExcerpt?: string | null;
  activeSpecExcerpt?: string | null;
  activeMilestoneId: string | null;
  activeTaskId: string | null;
  taskKind?: string | null;
  taskOwner?: string | null;
  expectedOutput?: string | null;
  taskStatus: string | null;
  blocker?: string | null;
  scaffoldFiles?: string[] | null;
}

export function buildExecutionPrompt(input: TaskContextInput): string {
  const lines = [
    "Execute the current task using the available coding tools.",
    `Goal: ${input.goalSummary ?? "(none)"}`,
    `Plan: ${input.activePlanPath ?? "(none)"}`,
    `Milestone: ${input.activeMilestoneId ?? "(none)"}`,
    `Task: ${input.activeTaskId ?? "(none)"}`,
    `Task kind: ${input.taskKind ?? "(none)"}`,
    `Task owner: ${input.taskOwner ?? "(none)"}`,
    `Expected output: ${input.expectedOutput ?? "(none)"}`,
    `Task status: ${input.taskStatus ?? "(none)"}`,
    `Current blocker: ${input.blocker ?? "(none)"}`
  ];

  if (input.activeSpecExcerpt) {
    lines.push("Spec excerpt:");
    lines.push(input.activeSpecExcerpt);
  }

  if (input.activePlanExcerpt) {
    lines.push("Plan excerpt:");
    lines.push(input.activePlanExcerpt);
  }

  if (input.activeTaskId) {
    lines.push(`Focus only on ${input.activeTaskId} and avoid unrelated changes.`);
  }

  if (input.scaffoldFiles && input.scaffoldFiles.length > 0) {
    lines.push("Existing scaffold files you should modify instead of only describing work:");
    for (const file of input.scaffoldFiles) {
      lines.push(`- ${file}`);
    }
  }

  lines.push("If you need to inspect files first, use read or bash before any mutation.");
  lines.push("Do not only describe intended work. Make concrete file changes in the working directory when implementation is required.");
  lines.push("If the task implies a runnable project, create any missing bootstrap files needed for verification, such as package.json, source files, tests, or README.");
  lines.push("Your work should leave the repository in a state where the task's verification command can succeed.");
  return lines.join("\n");
}

export function buildVerificationPrompt(input: TaskContextInput & { verifyCommands?: string[] | null }): string {
  const lines = [
    "Verify the current task independently and summarize whether the work appears complete.",
    `Goal: ${input.goalSummary ?? "(none)"}`,
    `Plan: ${input.activePlanPath ?? "(none)"}`,
    `Milestone: ${input.activeMilestoneId ?? "(none)"}`,
    `Task: ${input.activeTaskId ?? "(none)"}`,
    `Task kind: ${input.taskKind ?? "(none)"}`,
    `Task owner: ${input.taskOwner ?? "(none)"}`,
    `Expected output: ${input.expectedOutput ?? "(none)"}`,
    `Task status: ${input.taskStatus ?? "(none)"}`,
    `Verify commands: ${input.verifyCommands?.join(" ;; ") ?? "(none)"}`
  ];

  if (input.activeSpecExcerpt) {
    lines.push("Spec excerpt:");
    lines.push(input.activeSpecExcerpt);
  }

  if (input.activePlanExcerpt) {
    lines.push("Plan excerpt:");
    lines.push(input.activePlanExcerpt);
  }

  lines.push("Focus on validation evidence and gaps. Do not make unrelated edits.");
  return lines.join("\n");
}
