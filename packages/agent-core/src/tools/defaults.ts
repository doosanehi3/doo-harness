import type { AgentTool } from "../types.js";
import { createBashTool } from "./bash.js";
import { createEditTool } from "./edit.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";

export function createDefaultCodingTools(cwd: string): AgentTool[] {
  return [
    createReadTool(cwd),
    createWriteTool(cwd),
    createEditTool(cwd),
    createBashTool(cwd)
  ];
}
