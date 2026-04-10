import type { RuntimeFlow } from "../router/types.js";

export type Phase =
  | "idle"
  | "clarifying"
  | "planning"
  | "implementing"
  | "verifying"
  | "reviewing"
  | "paused"
  | "completed"
  | "cancelled";

export interface RunState {
  phase: Phase;
  currentFlow: RuntimeFlow | "auto";
  goalSummary: string | null;
  activeSpecPath: string | null;
  activePlanPath: string | null;
  activeMilestoneId: string | null;
  activeTaskId: string | null;
  lastVerificationStatus: string | null;
  lastVerificationPath: string | null;
  lastReviewPath: string | null;
  lastHandoffPath: string | null;
  pendingQuestions: string[];
  blocker: string | null;
  updatedAt: string;
}
