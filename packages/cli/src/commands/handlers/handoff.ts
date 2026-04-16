export interface HandoffInspectPayload {
  mode: "handoff-inspect";
  phase: string;
  goal: string | null;
  path: string | null;
  preview: string[];
  cleanupEligible: boolean;
  cleanupRecommendation: string;
  nextAction: string | null;
}

export interface HandoffCleanupPayload {
  mode: "handoff-cleanup";
  cleared: boolean;
  previousPath: string | null;
  reason: string;
  phase: string;
  remainingPath: string | null;
}

export function buildHandoffPreview(body: string, maxLines: number = 6): string[] {
  return body
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && line !== "# Handoff")
    .slice(0, maxLines);
}

export function buildHandoffInspectPayload(input: {
  phase: string;
  goal: string | null;
  path: string | null;
  preview: string[];
  nextAction: string | null;
}): HandoffInspectPayload {
  const cleanupEligible =
    input.path !== null &&
    (input.phase === "idle" || input.phase === "completed" || input.phase === "cancelled");
  return {
    mode: "handoff-inspect",
    phase: input.phase,
    goal: input.goal,
    path: input.path,
    preview: input.preview,
    cleanupEligible,
    cleanupRecommendation:
      input.path === null
        ? "Create a handoff before attempting cleanup."
        : cleanupEligible
          ? "Run `harness handoff cleanup` to clear the preserved handoff pointer."
          : "Keep the preserved handoff while the runtime remains active.",
    nextAction: input.nextAction
  };
}

export function buildHandoffCleanupPayload(input: {
  cleared: boolean;
  previousPath: string | null;
  reason: string;
  phase: string;
  remainingPath: string | null;
}): HandoffCleanupPayload {
  return {
    mode: "handoff-cleanup",
    cleared: input.cleared,
    previousPath: input.previousPath,
    reason: input.reason,
    phase: input.phase,
    remainingPath: input.remainingPath
  };
}

export function runHandoff(path: string): string {
  return `Handoff created: ${path}`;
}

export function runHandoffInspect(payload: HandoffInspectPayload): string {
  return [
    "Handoff",
    `Mode: inspect`,
    `Phase: ${payload.phase}`,
    `Goal: ${payload.goal ?? "-"}`,
    `Path: ${payload.path ?? "-"}`,
    `Cleanup eligible: ${payload.cleanupEligible ? "yes" : "no"}`,
    `Cleanup recommendation: ${payload.cleanupRecommendation}`,
    `Next: ${payload.nextAction ?? "-"}`,
    `Preview: ${payload.preview.length > 0 ? payload.preview.join(" | ") : "-"}`
  ].join("\n");
}

export function runHandoffCleanup(payload: HandoffCleanupPayload): string {
  return [
    "Handoff",
    `Mode: cleanup`,
    `Cleared: ${payload.cleared ? "yes" : "no"}`,
    `Previous path: ${payload.previousPath ?? "-"}`,
    `Reason: ${payload.reason}`,
    `Phase: ${payload.phase}`,
    `Remaining path: ${payload.remainingPath ?? "-"}`
  ].join("\n");
}
