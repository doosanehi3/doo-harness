import type { Phase } from "../phases/types.js";

const READ_ONLY_COMMAND_PREFIXES = [
  "cat ",
  "head ",
  "tail ",
  "sed ",
  "grep ",
  "rg ",
  "find ",
  "ls",
  "pwd",
  "printf ",
  "echo ",
  "git status",
  "git diff",
  "git log"
];

const MUTATING_PATTERNS = [
  /\brm\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\bmkdir\b/,
  /\btouch\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\btee\b/,
  />/,
  />>/,
  /\bnpm install\b/,
  /\bpnpm install\b/,
  /\byarn add\b/,
  /\bgit add\b/,
  /\bgit commit\b/,
  /\bgit push\b/
];

export function isReadOnlyPhase(phase: Phase): boolean {
  return phase === "planning" || phase === "clarifying" || phase === "verifying" || phase === "reviewing" || phase === "paused";
}

export function validateBashCommandForPhase(phase: Phase, command: string): void {
  if (!isReadOnlyPhase(phase)) {
    return;
  }

  const trimmed = command.trim();
  const hasAllowedPrefix = READ_ONLY_COMMAND_PREFIXES.some(prefix => trimmed === prefix.trim() || trimmed.startsWith(prefix));
  const hasMutatingPattern = MUTATING_PATTERNS.some(pattern => pattern.test(trimmed));

  if (!hasAllowedPrefix || hasMutatingPattern) {
    throw new Error(`bash command is not allowed during ${phase}: ${command}`);
  }
}
