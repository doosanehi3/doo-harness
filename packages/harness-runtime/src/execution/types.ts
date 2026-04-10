export type ExecutionRole = "planner" | "worker" | "validator";

export interface ExecutionRequest {
  role: ExecutionRole;
  modelId: string;
  cwd: string;
  goal: string;
  activeTaskId: string | null;
  activeMilestoneId: string | null;
  artifactPaths: string[];
}

export interface ExecutionResult {
  role: ExecutionRole;
  summary: string;
  evidence: string[];
  taskId: string | null;
}

export interface FreshExecutor {
  run(request: ExecutionRequest): Promise<ExecutionResult>;
}
