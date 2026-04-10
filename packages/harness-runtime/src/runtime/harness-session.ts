import type { RunState } from "../phases/types.js";
import type { TaskState } from "../state/task-state.js";

export interface HarnessSession {
  sessionId: string;
  branchId: string;
  cwd: string;
  state: RunState;
  taskState: TaskState;
}
