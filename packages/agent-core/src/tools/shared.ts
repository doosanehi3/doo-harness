import { resolve } from "node:path";

export function resolveWithinCwd(cwd: string, relativePath: string): string {
  return resolve(cwd, relativePath);
}

export function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  return value;
}

export function normalizeTextOutput(text: string): string {
  return text.length > 0 ? text : "(no output)";
}
