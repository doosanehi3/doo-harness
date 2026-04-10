export type VerificationStatus = "pass" | "fail" | "partial" | "blocked";
export type RecoveryHint = "manual_output_required" | "implementation_no_changes";

export interface VerificationCheck {
  kind: "runtime" | "command" | "manual";
  label: string;
  outcome: "pass" | "fail" | "info";
  detail: string;
}

export interface VerificationResult {
  status: VerificationStatus;
  mode?: "self_check" | "independent_validate";
  provider?: string | null;
  modelId?: string | null;
  targetTaskId?: string | null;
  expectedOutput?: string | null;
  taskOutputPath?: string | null;
  summary: string;
  evidence: string[];
  checks?: VerificationCheck[];
  failedChecks?: string[];
  recoveryHint?: RecoveryHint | null;
  suggestedNextStep?: string;
}
