import type { ProviderRoleReadiness } from "@doo/harness-runtime";

export function runProviderCheck(readiness: ProviderRoleReadiness[]): string {
  if (readiness.length === 0) {
    return "No provider configuration";
  }

  return readiness
    .map(item =>
      [
        `[${item.role}]`,
        `provider=${item.provider}`,
        `model=${item.modelId}`,
        `execution=${item.executionMode}`,
        `source=${item.authSource}`,
        `env=${item.envVar}`,
        `location=${item.credentialLocation}`,
        `apiKey=${item.hasApiKey ? "present" : "missing"}`,
        `status=${item.status}`,
        `auth=${item.authHeaderName}${item.authPrefix ? ` (${item.authPrefix})` : ""}`,
        `baseUrl=${item.baseUrl ?? "-"}`,
        `apiPath=${item.apiPath ?? "-"}`,
        `next=${item.suggestedAction}`
      ].join(" ")
    )
    .join("\n");
}
