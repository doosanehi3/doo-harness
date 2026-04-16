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

export interface ArtifactInspectPayload {
  mode: "artifact-inspect";
  target: string;
  resolvedBy: "latest" | "type" | "path";
  artifact: ArtifactMeta;
  preview: string[];
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

function buildArtifactPreview(body: string, maxLines: number = 6): string[] {
  return body
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

export function resolveArtifactTarget(
  artifacts: ArtifactMeta[],
  raw: string
): { artifact: ArtifactMeta | null; resolvedBy: ArtifactInspectPayload["resolvedBy"] | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { artifact: artifacts[0] ?? null, resolvedBy: artifacts[0] ? "latest" : null };
  }

  const exactType = ALLOWED_ARTIFACT_FILTERS.includes(trimmed as ArtifactType)
    ? filterArtifacts(artifacts, trimmed as ArtifactType)[0] ?? null
    : null;
  if (exactType) {
    return { artifact: exactType, resolvedBy: "type" };
  }

  const exactPath = artifacts.find(item => item.path === trimmed) ?? artifacts.find(item => item.path.endsWith(`/${trimmed}`));
  if (exactPath) {
    return { artifact: exactPath, resolvedBy: "path" };
  }

  return { artifact: null, resolvedBy: null };
}

export async function buildArtifactInspectPayload(
  artifacts: ArtifactMeta[],
  rawTarget: string,
  readArtifact: (path: string) => Promise<string>
): Promise<ArtifactInspectPayload> {
  const resolved = resolveArtifactTarget(artifacts, rawTarget);
  if (!resolved.artifact || !resolved.resolvedBy) {
    throw new Error(`Unknown artifact target: ${rawTarget.trim() || "(latest)"}`);
  }

  const body = await readArtifact(resolved.artifact.path).catch(() => "");
  return {
    mode: "artifact-inspect",
    target: rawTarget.trim() || "latest",
    resolvedBy: resolved.resolvedBy,
    artifact: resolved.artifact,
    preview: buildArtifactPreview(body)
  };
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

export function runArtifactInspect(payload: ArtifactInspectPayload): string {
  return [
    "Artifact",
    `Target: ${payload.target}`,
    `Resolved by: ${payload.resolvedBy}`,
    `Type: ${payload.artifact.type}`,
    `Path: ${payload.artifact.path}`,
    `Created: ${payload.artifact.createdAt}`,
    `Updated: ${payload.artifact.updatedAt}`,
    `Related task: ${payload.artifact.relatedTaskId ?? "-"}`,
    `Related phase: ${payload.artifact.relatedPhase ?? "-"}`,
    `Preview: ${payload.preview.length > 0 ? payload.preview.join(" | ") : "-"}`
  ].join("\n");
}
