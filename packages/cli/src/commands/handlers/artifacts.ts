import type { ArtifactMeta, ArtifactType } from "@doo/harness-runtime";

export const ALLOWED_ARTIFACT_FILTERS: ArtifactType[] = [
  "goal_summary",
  "spec",
  "plan",
  "milestones",
  "task_state",
  "verification",
  "review",
  "handoff",
  "note"
];

export interface ArtifactFilterParseResult {
  filter: ArtifactType | null;
  invalidFilter: string | null;
}

export function parseArtifactFilter(raw: string): ArtifactFilterParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { filter: null, invalidFilter: null };
  }

  if (ALLOWED_ARTIFACT_FILTERS.includes(trimmed as ArtifactType)) {
    return { filter: trimmed as ArtifactType, invalidFilter: null };
  }

  return { filter: null, invalidFilter: trimmed };
}

export function normalizeArtifactFilter(raw: string): ArtifactType | null {
  return parseArtifactFilter(raw).filter;
}

export function formatInvalidArtifactFilter(raw: string): string {
  return `Unknown artifact filter: ${raw}. Allowed: ${ALLOWED_ARTIFACT_FILTERS.join(", ")}`;
}

export function filterArtifacts(artifacts: ArtifactMeta[], filter: ArtifactType | null): ArtifactMeta[] {
  const filtered = filter ? artifacts.filter(artifact => artifact.type === filter) : artifacts;
  return [...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function formatArtifactMeta(artifact: ArtifactMeta): string {
  const context = [
    artifact.relatedTaskId ? `task=${artifact.relatedTaskId}` : null,
    artifact.relatedPhase ? `phase=${artifact.relatedPhase}` : null
  ].filter(Boolean);

  return context.length > 0 ? `${artifact.path} [${context.join(" ")}]` : artifact.path;
}

export function runArtifacts(artifacts: ArtifactMeta[], filter: ArtifactType | null = null): string {
  const filtered = filterArtifacts(artifacts, filter);
  if (filtered.length === 0) {
    return filter ? `No ${filter} artifacts` : "No artifacts";
  }

  const grouped = new Map<string, ArtifactMeta[]>();
  for (const artifact of filtered) {
    const bucket = grouped.get(artifact.type) ?? [];
    bucket.push(artifact);
    grouped.set(artifact.type, bucket);
  }

  return [...grouped.entries()]
    .flatMap(([type, items]) => [`${type}:`, ...items.map(item => `- ${formatArtifactMeta(item)}`), ""])
    .filter(Boolean)
    .join("\n");
}
