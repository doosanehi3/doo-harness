import type { FlowMode } from "./types.js";

const COMMANDS: FlowMode[] = [
  "auto",
  "direct",
  "clarify",
  "plan",
  "execute",
  "verify",
  "review",
  "longrun"
];

export interface ParsedCommandInput {
  explicitMode?: FlowMode;
  strippedInput: string;
}

export function parseCommand(input: string): ParsedCommandInput {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return { strippedInput: trimmed };
  }

  const [rawCommand, ...rest] = trimmed.slice(1).split(/\s+/);
  const explicitMode = COMMANDS.find(command => command === rawCommand);
  if (!explicitMode) {
    return { strippedInput: trimmed };
  }

  return {
    explicitMode,
    strippedInput: rest.join(" ").trim()
  };
}
