import type { ProviderDoctorResult } from "@doo/harness-runtime";

export function runProviderDoctor(results: ProviderDoctorResult[]): string {
  if (results.length === 0) {
    return "No provider configuration";
  }

  return results
    .map(result => {
      const lines = [
        `[${result.role}] provider=${result.readiness.provider} model=${result.readiness.modelId}`,
        `  readiness=${result.readiness.status} source=${result.readiness.authSource} location=${result.readiness.credentialLocation}`,
        `  next=${result.readiness.suggestedAction}`
      ];

      if (result.smoke) {
        lines.push(
          `  smoke=${result.smoke.stopReason} durationMs=${result.smoke.durationMs} response=${result.smoke.text || "-"}${result.smoke.errorMessage ? ` error=${result.smoke.errorMessage}` : ""}`
        );
      }

      return lines.join("\n");
    })
    .join("\n");
}
