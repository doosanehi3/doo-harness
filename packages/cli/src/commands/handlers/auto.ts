import type { AutoRunPayload } from "@doo/harness-runtime";

export interface ParsedAutoArgs {
  goal: string | null;
  maxSteps: number;
}

export function normalizeAutoInput(input: string): string {
  return input.trim() === "" ? "/status" : input.trim();
}

export function parseAutoArgs(raw: string): ParsedAutoArgs {
  const tokens = raw.split(/\s+/).filter(Boolean);
  const goalTokens: string[] = [];
  let maxSteps = 10;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "--steps") {
      const next = tokens[index + 1];
      if (next) {
        const parsed = Number.parseInt(next, 10);
        if (!Number.isNaN(parsed)) {
          maxSteps = Math.max(0, parsed);
          index += 1;
          continue;
        }
      }
    }
    if (token.startsWith("--steps=")) {
      const parsed = Number.parseInt(token.slice("--steps=".length), 10);
      if (!Number.isNaN(parsed)) {
        maxSteps = Math.max(0, parsed);
        continue;
      }
    }
    goalTokens.push(token);
  }

  const goal = goalTokens.join(" ").trim();
  return {
    goal: goal.length > 0 ? goal : null,
    maxSteps
  };
}

export function runAuto(payload: AutoRunPayload): string {
  return [
    "Auto",
    `Entry: ${payload.entry}`,
    `Goal: ${payload.goal ?? "-"}`,
    `Started new plan: ${payload.startedNewPlan ? "yes" : "no"}`,
    `Spec: ${payload.specPath ?? "-"}`,
    `Plan: ${payload.planPath ?? "-"}`,
    `Milestones: ${payload.milestonePath ?? "-"}`,
    `Stop reason: ${payload.stopReason}`,
    `Final phase: ${payload.finalPhase}`,
    `Final milestone: ${payload.finalMilestoneId ?? "-"}`,
    `Final task: ${payload.finalTaskId ?? "-"}`,
    `Completed: ${payload.completed ? "yes" : "no"}`,
    `Blocker: ${payload.blocker ?? "-"}`,
    `Pickup: ${payload.pickup.pickupKind}${payload.pickup.target ? ` -> ${payload.pickup.target}` : ""}`,
    `Next: ${payload.nextAction ?? "-"}`,
    `Summary: ${payload.summary}`,
    `Steps: ${payload.steps.length > 0 ? payload.steps.join(" | ") : "-"}`
  ].join("\n");
}
