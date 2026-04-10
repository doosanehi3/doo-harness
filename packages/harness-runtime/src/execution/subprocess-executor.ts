import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionRequest, ExecutionResult, FreshExecutor } from "./types.js";

const execFileAsync = promisify(execFile);

export class SubprocessFreshExecutor implements FreshExecutor {
  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const taskId = request.activeTaskId ?? "T1";
    const script = `
      const payload = {
        role: ${JSON.stringify(request.role)},
        taskId: ${JSON.stringify(taskId)},
        summary: ${JSON.stringify(`${request.role} completed subprocess execution for ${taskId} using ${request.modelId}.`)},
        evidence: [
          ${JSON.stringify(`model: ${request.modelId}`)},
          ${JSON.stringify(`goal: ${request.goal}`)},
          ${JSON.stringify(`task: ${taskId}`)},
          "context: subprocess runtime"
        ]
      };
      process.stdout.write(JSON.stringify(payload));
    `;

    const { stdout } = await execFileAsync(process.execPath, ["-e", script], {
      cwd: request.cwd
    });

    const parsed = JSON.parse(stdout) as ExecutionResult;
    return parsed;
  }
}
