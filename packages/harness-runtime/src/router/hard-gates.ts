import type { Phase } from "../phases/types.js";
import type { ClassificationResult } from "./types.js";

export interface GateContext {
  currentPhase: Phase;
  hasActivePlan: boolean;
  hasVerificationTarget: boolean;
  hasPendingHandoff: boolean;
  hasActiveMilestone: boolean;
}

export interface GateFailure {
  code:
    | "clarification_required"
    | "plan_required"
    | "verification_target_missing"
    | "handoff_required"
    | "invalid_phase_transition";
  message: string;
}

export function requirePlan(context: GateContext, classification: ClassificationResult): GateFailure | undefined {
  if (classification.workClass === "trivial") {
    return undefined;
  }
  if (context.hasActivePlan) {
    return undefined;
  }
  return {
    code: "plan_required",
    message: "A plan or milestone artifact is required before execution for non-trivial work."
  };
}

export function requireVerificationTarget(context: GateContext): GateFailure | undefined {
  if (context.hasVerificationTarget) {
    return undefined;
  }
  return {
    code: "verification_target_missing",
    message: "No verification target is available for the current session."
  };
}

export function requireHandoffBeforeReset(context: GateContext): GateFailure | undefined {
  if (context.currentPhase === "idle" || context.currentPhase === "completed" || context.currentPhase === "cancelled") {
    return undefined;
  }
  if (context.hasPendingHandoff) {
    return undefined;
  }
  return {
    code: "handoff_required",
    message: "Create a handoff before resetting an active session."
  };
}
