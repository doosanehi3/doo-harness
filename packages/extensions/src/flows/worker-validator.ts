export function workerPrompt(task: string): string {
  return `Implement the task: ${task}`;
}

export function validatorPrompt(task: string): string {
  return `Validate the completed task independently: ${task}`;
}
