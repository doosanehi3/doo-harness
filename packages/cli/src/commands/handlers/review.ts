import { readFile } from "node:fs/promises";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ArtifactMeta } from "@doo/harness-runtime";
import type { RuntimeStatus } from "@doo/harness-runtime";

const execFile = promisify(execFileCb);

export type ReviewMode = "quick" | "diff" | "deep" | "history" | "artifact";

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

async function buildDiffStat(cwd: string, targetPath?: string | null): Promise<string[]> {
  try {
    const diffArgs = targetPath ? ["diff", "--stat", "--", targetPath] : ["diff", "--stat", "--", "."];
    const [diffResult, untrackedResult] = await Promise.allSettled([
      execFile("git", diffArgs, { cwd }),
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
            .filter(
              line =>
                line.length > 0 &&
                !line.startsWith(".harness/") &&
                (targetPath ? matchesDiffTarget(line, targetPath) : true)
            )
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

function normalizeArtifactPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}

function matchesDiffTarget(candidatePath: string, targetPath: string): boolean {
  const candidate = normalizeArtifactPath(candidatePath);
  const target = normalizeArtifactPath(targetPath);
  return candidate === target || candidate.startsWith(`${target}/`);
}

function resolveArtifactTarget(target: string, artifacts: ArtifactMeta[]): ArtifactMeta | null {
  const trimmed = target.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedTarget = normalizeArtifactPath(trimmed);
  const exact = artifacts.find(item => item.path === trimmed) ?? artifacts.find(item => item.type === trimmed);
  if (exact) {
    return exact;
  }

  const pathMatches = artifacts.filter(item => {
    const normalizedPath = normalizeArtifactPath(item.path);
    return (
      normalizedPath === normalizedTarget ||
      normalizedPath.endsWith(`/${normalizedTarget}`)
    );
  });

  if (pathMatches.length === 1) {
    return pathMatches[0]!;
  }

  if (pathMatches.length > 1) {
    throw new Error(`Ambiguous review artifact target: ${trimmed}`);
  }

  return null;
}

function summarizeReview(mode: ReviewMode, status: RuntimeStatus, target?: string | null): string {
  if (mode === "diff") {
    return target
      ? `Review the working tree diff for ${target} against the active runtime state.`
      : "Review the current working tree diff against the active runtime state.";
  }
  if (mode === "deep") {
    return "Review the runtime state with diff and recent artifact context.";
  }
  if (mode === "history") {
    return "Inspect recent review-related artifacts from the runtime history.";
  }
  if (mode === "artifact") {
    return target ? `Inspect the artifact target ${target}.` : "Inspect the selected artifact target.";
  }
  return status.activeTaskId
    ? `Fast review of the active task state for ${status.activeTaskId}.`
    : "Fast review of the current runtime state.";
}

function selectTarget(mode: ReviewMode, status: RuntimeStatus, target?: string | null): string {
  if (mode === "diff") {
    return target ? `working-tree-diff:${target}` : "working-tree-diff";
  }
  if (mode === "history") {
    return "review-history";
  }
  if (mode === "artifact") {
    return target ? `artifact:${target}` : "artifact";
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
    target?: string | null;
    previewOverride?: string[];
    pathOverride?: string;
  }
): Promise<ReviewPayload> {
  const effectivePath = options.pathOverride ?? path;
  let preview: string[] = options.previewOverride ?? [];
  if (preview.length === 0) {
    try {
      preview = extractPreview(await readFile(effectivePath, "utf8"));
    } catch {
      preview = [];
    }
  }

  const artifacts = options.artifacts ?? [];
  const diffStat =
    options.mode === "quick" || options.mode === "history" || options.mode === "artifact"
      ? []
      : await buildDiffStat(options.cwd, options.target);

  return {
    mode: options.mode,
    target: selectTarget(options.mode, status, options.target),
    path: effectivePath,
    summary: summarizeReview(options.mode, status, options.target),
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

export function buildReviewHistoryPayload(artifacts: ArtifactMeta[], status: RuntimeStatus): ReviewPayload {
  const history = selectHistory(artifacts, 8);
  return {
    mode: "history",
    target: "review-history",
    path: "(history)",
    summary: summarizeReview("history", status),
    preview: history.slice(0, 6),
    diffStat: [],
    history,
    phase: status.phase,
    taskId: status.activeTaskId,
    taskText: status.activeTaskText,
    verificationStatus: status.lastVerificationStatus,
    handoffEligible: status.handoffEligible,
    handoffReason: status.handoffReason,
    nextAction: status.nextAction ?? null
  };
}

export async function buildArtifactReviewPayload(
  target: string,
  artifacts: ArtifactMeta[],
  status: RuntimeStatus
): Promise<ReviewPayload> {
  const trimmed = target.trim();
  const artifact = resolveArtifactTarget(trimmed, artifacts);

  if (!artifact) {
    throw new Error(`Unknown review artifact target: ${trimmed}`);
  }

  return buildReviewPayload(artifact.path, status, {
    mode: "artifact",
    cwd: ".",
    artifacts,
    target: trimmed
  });
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
