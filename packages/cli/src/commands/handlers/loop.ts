export function runLoop(steps: string[]): string {
  if (steps.length === 0) {
    return "Completion loop made no progress.";
  }

  return ["Completion loop:", ...steps.map((step, index) => `${index + 1}. ${step}`)].join("\n");
}
