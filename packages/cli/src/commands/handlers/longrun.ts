export function runLongRun(planPath: string, milestonePath: string): string {
  return `Long-running plan ready:\nPlan: ${planPath}\nMilestones: ${milestonePath}`;
}
