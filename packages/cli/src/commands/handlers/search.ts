import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeStatus } from "@doo/harness-runtime";

const execFile = promisify(execFileCb);
const SEARCH_LIMIT = 20;
const SEARCH_MAX_BUFFER = 4 * 1024 * 1024;

export interface SearchPayload {
  mode: "find" | "grep";
  query: string;
  cwd: string;
  phase: string;
  taskId: string | null;
  taskText: string | null;
  matches: string[];
  truncated: boolean;
  command: string;
}

function normalizeMatches(lines: string[]): string[] {
  return lines
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith("node_modules/"))
    .filter(line => !line.startsWith(".git/"))
    .filter(line => !line.startsWith("dist/"));
}

async function runRipgrep(args: string[], cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFile("rg", args, {
      cwd,
      maxBuffer: SEARCH_MAX_BUFFER
    });
    return stdout.split("\n");
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException & { stdout?: string; code?: string | number };
    if (String(candidate.code) === "1") {
      return candidate.stdout ? candidate.stdout.split("\n") : [];
    }
    if (candidate.code === "ENOENT") {
      throw new Error("ripgrep (rg) is required for harness find/grep.");
    }
    throw error;
  }
}

export async function buildFindPayload(cwd: string, query: string, status: RuntimeStatus): Promise<SearchPayload> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("find requires a file-name query.");
  }

  const files = normalizeMatches(
    await runRipgrep(["--files", "--hidden", "-g", "!.git", "-g", "!node_modules", "-g", "!dist"], cwd)
  );
  const lowered = normalizedQuery.toLowerCase();
  const matches = files.filter(line => line.toLowerCase().includes(lowered));

  return {
    mode: "find",
    query: normalizedQuery,
    cwd,
    phase: status.phase,
    taskId: status.activeTaskId,
    taskText: status.activeTaskText,
    matches: matches.slice(0, SEARCH_LIMIT),
    truncated: matches.length > SEARCH_LIMIT,
    command: `rg --files --hidden | filter(${JSON.stringify(normalizedQuery)})`
  };
}

export async function buildGrepPayload(cwd: string, query: string, status: RuntimeStatus): Promise<SearchPayload> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("grep requires a content query.");
  }

  const matches = normalizeMatches(
    await runRipgrep(
      ["-n", "--hidden", "--smart-case", "--glob", "!.git", "--glob", "!node_modules", "--glob", "!dist", normalizedQuery, "."],
      cwd
    )
  );

  return {
    mode: "grep",
    query: normalizedQuery,
    cwd,
    phase: status.phase,
    taskId: status.activeTaskId,
    taskText: status.activeTaskText,
    matches: matches.slice(0, SEARCH_LIMIT),
    truncated: matches.length > SEARCH_LIMIT,
    command: `rg -n --hidden --smart-case ${JSON.stringify(normalizedQuery)}`
  };
}

export function runSearch(result: SearchPayload): string {
  return [
    `${result.mode === "find" ? "Find" : "Grep"} results for "${result.query}"`,
    `Phase: ${result.phase}`,
    `Task context: ${result.taskId ?? "-"}${result.taskText ? ` ${result.taskText}` : ""}`,
    `Matches: ${result.matches.length === 0 ? "(none)" : result.matches.join(" | ")}`,
    `Truncated: ${result.truncated ? "yes" : "no"}`,
    `Command: ${result.command}`
  ].join("\n");
}
