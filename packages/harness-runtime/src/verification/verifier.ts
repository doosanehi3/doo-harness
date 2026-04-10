import type { ArtifactStore } from "../artifacts/artifact-store.js";
import type { VerificationResult } from "./types.js";

  export async function writeVerificationResult(
    store: ArtifactStore,
    sessionId: string,
    result: VerificationResult
  ): Promise<string> {
  const content = [
    "# Verification Report",
    "",
      `Status: ${result.status}`,
      result.mode ? `Mode: ${result.mode}` : null,
      result.provider ? `Provider: ${result.provider}` : null,
      result.modelId ? `Model: ${result.modelId}` : null,
      result.targetTaskId ? `Target Task: ${result.targetTaskId}` : null,
      result.expectedOutput ? `Expected Output: ${result.expectedOutput}` : null,
      result.taskOutputPath ? `Task Output: ${result.taskOutputPath}` : null,
      result.recoveryHint ? `Recovery Hint: ${result.recoveryHint}` : null,
      "",
      "## Summary",
      result.summary,
      "",
      "## Evidence",
      ...(result.evidence.length === 0 ? ["- (none)"] : result.evidence.map(item => `- ${item}`)),
      "",
      "## Checks",
      ...(result.checks && result.checks.length > 0
        ? result.checks.map(
            check => `- [${check.outcome}] ${check.kind} ${check.label}: ${check.detail}`
          )
        : ["- (none)"]),
      "",
      "## Failed Checks",
      ...(result.failedChecks && result.failedChecks.length > 0
        ? result.failedChecks.map(item => `- ${item}`)
        : ["- (none)"]),
      "",
      "## Suggested Next Step",
      result.suggestedNextStep ?? "(none)"
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
    const meta = await store.write("verification", content, sessionId);
    return meta.path;
  }
