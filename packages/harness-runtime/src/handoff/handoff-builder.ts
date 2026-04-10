import type { ArtifactStore } from "../artifacts/artifact-store.js";
import { renderHandoffTemplate } from "./handoff-template.js";

export async function createHandoff(
  store: ArtifactStore,
  input: {
    sessionId: string;
    goal: string | null;
    phase: string;
    activeSpecPath: string | null;
    activePlanPath: string | null;
    activeMilestoneId: string | null;
    activeMilestoneText: string | null;
    activeMilestoneStatus: string | null;
    nextMilestoneId: string | null;
    nextMilestoneText: string | null;
    milestoneProgress: string;
    milestoneStatusCounts: string;
    taskProgress: string;
    taskStatusCounts: string;
    activeTaskId: string | null;
    activeTaskText: string | null;
    activeTaskStatus: string | null;
    activeTaskKind: string | null;
    activeTaskOwner: string | null;
    activeTaskExpectedOutput: string | null;
    activeTaskOutputPath: string | null;
    activeProvider: string;
    activeModelId: string;
    activeModelTemperature: number | null;
    activeModelMaxTokens: number | null;
    activeExecutionMode: string;
    lastVerificationStatus: string | null;
    activeTaskRecoveryHint: string | null;
    readyTasks: string[];
    pendingDependencies: string[];
    allowedTools: string[];
    artifactPaths: string[];
    nextStep: string;
    verificationPath: string | null;
    blocker: string | null;
  }
): Promise<string> {
  const content = renderHandoffTemplate(input);
  const meta = await store.write("handoff", content, input.sessionId);
  return meta.path;
}
