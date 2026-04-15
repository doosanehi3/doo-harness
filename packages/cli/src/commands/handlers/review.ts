import { readFile } from "node:fs/promises";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ArtifactMeta } from "@doo/harness-runtime";
import type { RuntimeStatus } from "@doo/harness-runtime";

const execFile = promisify(execFileCb);

export type ReviewMode = "quick" | "diff" | "deep";

export interface ReviewPayload {
  mode: ReviewMode;
  target: string;
  path: string;
  summary: string;
  preview: string[];
  diffStat: string[];
  history: string[];
  phase: string;
  taskId: string | null;
  taskText: string | null;
  verificationStatus: string | null;
  handoffEligible: boolean;
  handoffReason: string | null;
  nextAction: string | null;
}

function extractPreview(body: string, maxLines: number = 6): string[] {
  return body
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && line !== "# Review")
    .slice(0, maxLines);
}

async function buildDiffStat(cwd: string): Promise<string[]> {
  try {
    const [diffResult, untrackedResult] = await Promise.allSettled([
      execFile("git", ["diff", "--stat", "--", "."], { cwd }),
      execFile("git", ["ls-files", "--others", "--exclude-standard"], { cwd })
    ]);

    const diffLines =
      diffResult.status === "fulfilled"
        ? diffResult.value.stdout
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean)
        : [];
    const untrackedLines =
      untrackedResult.status === "fulfilled"
        ? untrackedResult.value.stdout
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith(".harness/"))
            .map(line => `untracked: ${line}`)
        : [];
    if (diffResult.status === "rejected" && untrackedResult.status === "rejected") {
      return ["(git diff unavailable)"];
    }

    const lines = [...diffLines, ...untrackedLines];
    return lines.length > 0 ? lines.slice(0, 6) : ["(working tree clean)"];
  } catch {
    return ["(git diff unavailable)"];
  }
}

function summarizeReview(mode: ReviewMode, status: RuntimeStatus): string {
  if (mode === "diff") {
    return "Review the current working tree diff against the active runtime state.";
  }
  if (mode === "deep") {
    return "Review the runtime state with diff and recent artifact context.";
  }
  return status.activeTaskId
    ? `Fast review of the active task state for ${status.activeTaskId}.`
    : "Fast review of the current runtime state.";
}

function selectTarget(mode: ReviewMode, status: RuntimeStatus): string {
  if (mode === "diff") {
    return "working-tree-diff";
  }
  return status.activeTaskId ? `active-task:${status.activeTaskId}` : "current-runtime";
}

function selectHistory(artifacts: ArtifactMeta[], limit: number = 4): string[] {
  return [...artifacts]
    .filter(item => item.type === "review" || item.type === "verification" || item.type === "handoff")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map(item => `${item.type}: ${item.path}`);
}

export async function buildReviewPayload(
  path: string,
  status: RuntimeStatus,
  options: {
    mode: ReviewMode;
    cwd: string;
    artifacts?: ArtifactMeta[];
  }
): Promise<ReviewPayload> {
  let preview: string[] = [];
  try {
    preview = extractPreview(await readFile(path, "utf8"));
  } catch {
    preview = [];
  }

  const artifacts = options.artifacts ?? [];
  const diffStat = options.mode === "quick" ? [] : await buildDiffStat(options.cwd);

  return {
    mode: options.mode,
    target: selectTarget(options.mode, status),
    path,
    summary: summarizeReview(options.mode, status),
    preview,
    diffStat,
    history: options.mode === "deep" ? selectHistory(artifacts) : [],
    phase: status.phase,
    taskId: status.activeTaskId,
    taskText: status.activeTaskText,
    verificationStatus: status.lastVerificationStatus,
    handoffEligible: status.handoffEligible,
    handoffReason: status.handoffReason,
    nextAction: status.nextAction ?? null
  };
}

export function runReview(review: ReviewPayload): string {
  return [
    "Review",
    `Mode: ${review.mode}`,
    `Target: ${review.target}`,
    `Path: ${review.path}`,
    `Summary: ${review.summary}`,
    `Phase: ${review.phase}`,
    `Task: ${review.taskId ?? "-"}${review.taskText ? ` ${review.taskText}` : ""}`,
    `Verification status: ${review.verificationStatus ?? "-"}`,
    `Handoff eligible: ${review.handoffEligible ? "yes" : "no"}`,
    `Handoff reason: ${review.handoffReason ?? "-"}`,
    `Next: ${review.nextAction ?? "-"}`,
    `Preview: ${review.preview.length > 0 ? review.preview.join(" | ") : "-"}`,
    `Diff: ${review.diffStat.length > 0 ? review.diffStat.join(" | ") : "-"}`,
    `History: ${review.history.length > 0 ? review.history.join(" | ") : "-"}`
  ].join("\n");
}
