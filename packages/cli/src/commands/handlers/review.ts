import { readFile } from "node:fs/promises";
import type { RuntimeStatus } from "@doo/harness-runtime";

export interface ReviewPayload {
  path: string;
  preview: string[];
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

export async function buildReviewPayload(path: string, status: RuntimeStatus): Promise<ReviewPayload> {
  let preview: string[] = [];
  try {
    preview = extractPreview(await readFile(path, "utf8"));
  } catch {
    preview = [];
  }

  return {
    path,
    preview,
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
    `Path: ${review.path}`,
    `Phase: ${review.phase}`,
    `Task: ${review.taskId ?? "-"}${review.taskText ? ` ${review.taskText}` : ""}`,
    `Verification status: ${review.verificationStatus ?? "-"}`,
    `Handoff eligible: ${review.handoffEligible ? "yes" : "no"}`,
    `Handoff reason: ${review.handoffReason ?? "-"}`,
    `Next: ${review.nextAction ?? "-"}`,
    `Preview: ${review.preview.length > 0 ? review.preview.join(" | ") : "-"}`
  ].join("\n");
}
