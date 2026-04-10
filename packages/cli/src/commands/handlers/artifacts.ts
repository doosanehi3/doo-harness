import type { ArtifactMeta } from "@doo/harness-runtime";

export function runArtifacts(artifacts: ArtifactMeta[]): string {
  if (artifacts.length === 0) {
    return "No artifacts";
  }
  return artifacts.map(artifact => `${artifact.type}: ${artifact.path}`).join("\n");
}
