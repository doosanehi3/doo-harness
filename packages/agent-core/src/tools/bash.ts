import { spawn } from "node:child_process";
import type { AgentTool } from "../types.js";
import { ensureString, normalizeTextOutput } from "./shared.js";

export interface BashToolPolicy {
  validate(command: string): void;
}

export function createBashTool(cwd: string, policy?: BashToolPolicy): AgentTool {
  return {
    name: "bash",
    description: "Run a shell command inside the working directory",
    async execute(_toolCallId, input, signal) {
      const command = ensureString(input.command, "command");
      policy?.validate(command);

      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
        const proc = spawn("/bin/sh", ["-lc", command], {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
          signal
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", chunk => {
          stdout += chunk.toString();
        });
        proc.stderr.on("data", chunk => {
          stderr += chunk.toString();
        });
        proc.on("error", reject);
        proc.on("close", exitCode => {
          resolve({ stdout, stderr, exitCode });
        });
      });

      const text = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
      return {
        content: [{ type: "text", text: normalizeTextOutput(text) }],
        details: {
          command,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        }
      };
    }
  };
}
