import { readFile, writeFile } from "node:fs/promises";
import type { AgentTool } from "../types.js";
import { ensureString, resolveWithinCwd } from "./shared.js";

export function createEditTool(cwd: string): AgentTool {
  return {
    name: "edit",
    description: "Replace text in a file inside the working directory",
    async execute(_toolCallId, input) {
      const relativePath = ensureString(input.path, "path");
      const oldText = ensureString(input.oldText, "oldText");
      const newText = ensureString(input.newText, "newText");
      const absolutePath = resolveWithinCwd(cwd, relativePath);
      const current = await readFile(absolutePath, "utf8");
      if (!current.includes(oldText)) {
        throw new Error(`oldText not found in ${relativePath}`);
      }
      const updated = current.replace(oldText, newText);
      await writeFile(absolutePath, updated, "utf8");
      return {
        content: [{ type: "text", text: `Edited ${relativePath}` }],
        details: {
          path: absolutePath,
          replaced: oldText,
          inserted: newText
        }
      };
    }
  };
}
