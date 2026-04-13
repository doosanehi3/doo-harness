import type { WebSmokeResult } from "@doo/harness-runtime";

export function runWebSmoke(result: WebSmokeResult): string {
  return [
    `Success: ${result.success ? "yes" : "no"}`,
    `URL: ${result.url}`,
    `Status: ${result.statusCode ?? "-"}`,
    `Title: ${result.title ?? "-"}`,
    `Duration ms: ${result.durationMs}`,
    `Body snippet: ${result.bodySnippet || "-"}`,
    result.errorMessage ? `Error: ${result.errorMessage}` : null
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
