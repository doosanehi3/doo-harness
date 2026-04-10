import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Phase } from "../phases/types.js";
import type { RecoveryHint } from "../verification/types.js";

export interface TaskState {
  activeMilestoneId: string | null;
  activeTaskId: string | null;
  milestones: Record<string, "todo" | "in_progress" | "done" | "blocked">;
  milestoneTexts: Record<string, string>;
  tasks: Record<string, "todo" | "in_progress" | "validated" | "done" | "blocked">;
    taskMilestones: Record<string, string>;
    taskTexts: Record<string, string>;
    taskKinds: Record<string, string>;
    taskOwners: Record<string, string>;
    taskExpectedOutputs: Record<string, string>;
    taskVerificationCommands: Record<string, string[]>;
    taskDependencies: Record<string, string[]>;
    milestoneKinds: Record<string, string>;
  milestoneDependencies: Record<string, string[]>;
  taskOutputs: Record<string, string>;
  taskBlockers: Record<string, string>;
  taskRecoveryHints: Record<string, RecoveryHint>;
  resumePhase: Phase | null;
  lastVerificationStatus: string | null;
  lastVerificationPath: string | null;
  lastReviewPath: string | null;
  lastHandoffPath: string | null;
  blockers: string[];
}

export function createInitialTaskState(): TaskState {
  return {
      activeMilestoneId: null,
      activeTaskId: null,
      milestones: {},
      milestoneTexts: {},
      tasks: {},
      taskMilestones: {},
      taskTexts: {},
      taskKinds: {},
      taskOwners: {},
      taskExpectedOutputs: {},
      taskVerificationCommands: {},
      taskDependencies: {},
      milestoneKinds: {},
      milestoneDependencies: {},
      taskOutputs: {},
      taskBlockers: {},
      taskRecoveryHints: {},
      resumePhase: null,
      lastVerificationStatus: null,
      lastVerificationPath: null,
      lastReviewPath: null,
      lastHandoffPath: null,
      blockers: []
    };
}

export async function loadTaskState(path: string): Promise<TaskState> {
  try {
    const raw = await readFile(path, "utf8");
    return {
      ...createInitialTaskState(),
      ...JSON.parse(raw)
    };
  } catch {
    return createInitialTaskState();
  }
}

export async function saveTaskState(path: string, state: TaskState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}
