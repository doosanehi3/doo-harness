import type { ProviderSmokeResult } from "@doo/harness-runtime";

export function runProviderSmoke(result: ProviderSmokeResult): string {
  return [
    `Role: ${result.role}`,
    `Provider: ${result.provider}`,
    `Model: ${result.modelId}`,
    `Duration ms: ${result.durationMs}`,
    `Stop reason: ${result.stopReason}`,
    `Response: ${result.text || "-"}`,
    result.errorMessage ? `Error: ${result.errorMessage}` : null
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
