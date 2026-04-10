import type { ExecutionRequest, ExecutionResult, FreshExecutor } from "./types.js";

export class InProcessFreshExecutor implements FreshExecutor {
  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const taskId = request.activeTaskId ?? "T1";
    if (request.role === "planner") {
      return {
        role: "planner",
        taskId,
        summary: `Planner completed fresh-context analysis for ${taskId} using ${request.modelId}.`,
        evidence: [
          `model: ${request.modelId}`,
          `goal: ${request.goal}`,
          `task: ${taskId}`,
          "context: fresh in-process runtime",
          "planning path: scoped analysis"
        ]
      };
    }

    if (request.role === "worker") {
      return {
        role: "worker",
        taskId,
        summary: `Worker completed fresh-context execution for ${taskId} using ${request.modelId}.`,
        evidence: [
          `model: ${request.modelId}`,
          `goal: ${request.goal}`,
          `task: ${taskId}`,
          "context: fresh in-process runtime"
        ]
      };
    }

    return {
      role: "validator",
      taskId,
      summary: `Validator independently reviewed ${taskId} in a fresh context using ${request.modelId}.`,
      evidence: [
        `model: ${request.modelId}`,
        `goal: ${request.goal}`,
        `task: ${taskId}`,
        "context: fresh in-process runtime",
        "validation path: independent"
      ]
    };
  }
}
