import type { Phase } from "../phases/types.js";
import type { RuntimeFlow } from "../router/types.js";

export const READ_ONLY_TOOL_NAMES = ["read", "bash"] as const;
export const IMPLEMENTATION_TOOL_NAMES = ["read", "write", "edit", "bash"] as const;

export interface ToolPolicyInput {
  phase: Phase;
  flow: RuntimeFlow | "auto";
  activeTaskId: string | null;
  activeTaskKind?: string | null;
  activeTaskStatus?: "todo" | "in_progress" | "validated" | "done" | "blocked" | null;
  activeTaskBlocker?: string | null;
  blocker: string | null;
}

export function getAllowedToolNamesForPhase(input: ToolPolicyInput): string[] {
  const isImplementationKind =
    input.activeTaskKind === null ||
    input.activeTaskKind === undefined ||
    input.activeTaskKind === "implementation";

  if (
    input.phase === "implementing" &&
    input.activeTaskId &&
    isImplementationKind &&
    input.activeTaskStatus !== "validated" &&
    input.activeTaskStatus !== "done" &&
    input.activeTaskStatus !== "blocked" &&
    !input.blocker &&
    !input.activeTaskBlocker
  ) {
    return [...IMPLEMENTATION_TOOL_NAMES];
  }

  if (
    input.phase === "verifying" ||
    input.phase === "reviewing" ||
    input.phase === "planning" ||
    input.phase === "clarifying"
  ) {
    return [...READ_ONLY_TOOL_NAMES];
  }

  if (input.phase === "paused") {
    return [...READ_ONLY_TOOL_NAMES];
  }

  if (input.phase === "completed" || input.phase === "cancelled" || input.phase === "idle") {
    return [...READ_ONLY_TOOL_NAMES];
  }

  if (input.flow === "worker_validator") {
    return [...READ_ONLY_TOOL_NAMES];
  }

  return [...READ_ONLY_TOOL_NAMES];
}
