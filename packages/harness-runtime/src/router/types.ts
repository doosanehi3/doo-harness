export type FlowMode = "auto" | "direct" | "clarify" | "plan" | "execute" | "verify" | "review" | "longrun";
export type WorkClass = "trivial" | "standard" | "risky" | "long_running";
export type RuntimeFlow = "direct" | "disciplined_single" | "worker_validator" | "milestone";

export interface ClassificationResult {
  workClass: WorkClass;
  ambiguous: boolean;
  risky: boolean;
  longRunning: boolean;
  reasons: string[];
}

export interface RouteDecision {
  selectedFlow: RuntimeFlow;
  nextPhase: import("../phases/types.js").Phase;
  modeSource: "explicit" | "auto";
  classification: ClassificationResult;
  downgradedFrom?: FlowMode;
  blocked?: {
    code:
      | "clarification_required"
      | "plan_required"
      | "verification_target_missing"
      | "handoff_required"
      | "invalid_phase_transition";
    message: string;
  };
}
