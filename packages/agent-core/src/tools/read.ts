import { readFile } from "node:fs/promises";
import type { AgentTool } from "../types.js";
import { ensureString, normalizeTextOutput, resolveWithinCwd } from "./shared.js";

export function createReadTool(cwd: string): AgentTool {
  return {
    name: "read",
    description: "Read a file from the working directory",
    async execute(_toolCallId, input) {
      const relativePath = ensureString(input.path, "path");
      const absolutePath = resolveWithinCwd(cwd, relativePath);
      const content = await readFile(absolutePath, "utf8");
      return {
        content: [{ type: "text", text: normalizeTextOutput(content) }],
        details: { path: absolutePath, bytes: Buffer.byteLength(content) }
      };
    }
  };
}
