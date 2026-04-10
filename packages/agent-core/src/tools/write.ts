import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentTool } from "../types.js";
import { ensureString, resolveWithinCwd } from "./shared.js";

export function createWriteTool(cwd: string): AgentTool {
  return {
    name: "write",
    description: "Write a file inside the working directory",
    async execute(_toolCallId, input) {
      const relativePath = ensureString(input.path, "path");
      const content = ensureString(input.content, "content");
      const absolutePath = resolveWithinCwd(cwd, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
      return {
        content: [{ type: "text", text: `Wrote ${relativePath}` }],
        details: { path: absolutePath, bytes: Buffer.byteLength(content) }
      };
    }
  };
}
