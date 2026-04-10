export function runExecute(task: string | null): string {
  return `Execution started${task ? ` for ${task}` : ""}`;
}
