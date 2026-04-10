export type ArtifactType =
  | "goal_summary"
  | "spec"
  | "plan"
  | "milestones"
  | "task_state"
  | "verification"
  | "review"
  | "handoff"
  | "note";

export interface ArtifactMeta {
  id: string;
  type: ArtifactType;
  path: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  relatedPhase?: string;
  relatedMilestoneId?: string;
  relatedTaskId?: string;
}
