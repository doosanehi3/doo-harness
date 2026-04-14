import type { WebVerifyResult } from "@doo/harness-runtime";

export function runWebVerify(result: WebVerifyResult): string {
  return [
    `Success: ${result.success ? "yes" : "no"}`,
    `URL: ${result.url}`,
    `Status: ${result.statusCode ?? "-"}`,
    `Title: ${result.title ?? "-"}`,
    `Duration ms: ${result.durationMs}`,
    `Body snippet: ${result.bodySnippet || "-"}`,
    result.snapshotPath ? `Snapshot: ${result.snapshotPath}` : null,
    result.consoleLogPath ? `Console log: ${result.consoleLogPath}` : null,
    result.errorMessage ? `Error: ${result.errorMessage}` : null
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
