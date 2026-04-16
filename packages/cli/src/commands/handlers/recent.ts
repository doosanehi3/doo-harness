import type { ArtifactMeta, ArtifactType, RelatedArtifactsPayload, RuntimeStatus } from "@doo/harness-runtime";
import { filterArtifacts, formatInvalidArtifactFilter, parseArtifactFilter } from "./artifacts.js";

export type RecentQuery = ArtifactType | "failures" | "active-task" | null;

export interface RecentPayload {
  mode: "recent";
  filter: RecentQuery;
  phase: string;
  taskId: string | null;
  taskText: string | null;
  matches: string[];
  groups: Array<{ label: string; matches: string[] }>;
  summary: string;
}

export interface RecentPayloadOptions {
  readArtifact?: (path: string) => Promise<string>;
  relatedArtifacts?: RelatedArtifactsPayload;
}

export function parseRecentQuery(raw: string): { filter: RecentQuery; invalidFilter: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { filter: null, invalidFilter: null };
  }
  if (trimmed === "failures" || trimmed === "active-task") {
    return { filter: trimmed, invalidFilter: null };
  }
  const parsed = parseArtifactFilter(trimmed);
  return {
    filter: parsed.filter,
    invalidFilter: parsed.invalidFilter
  };
}

async function buildFailureMatches(
  artifacts: ArtifactMeta[],
  readArtifact: (path: string) => Promise<string>,
  limit: number
): Promise<string[]> {
  const verificationArtifacts = filterArtifacts(artifacts, "verification");
  const matches: string[] = [];

  for (const artifact of verificationArtifacts) {
    const body = await readArtifact(artifact.path).catch(() => "");
    if (/Status:\s*(fail|blocked|partial)/i.test(body)) {
      matches.push(artifact.path);
    }
    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

function buildActiveTaskMatches(relatedArtifacts: RelatedArtifactsPayload | undefined, limit: number): string[] {
  if (!relatedArtifacts) {
    return [];
  }

  return relatedArtifacts.items.slice(0, limit).map(item => item.path);
}

export async function buildRecentPayload(
  artifacts: ArtifactMeta[],
  rawFilter: string,
  status: RuntimeStatus,
  options: RecentPayloadOptions = {},
  limit: number = 5
): Promise<RecentPayload> {
  const { filter, invalidFilter } = parseRecentQuery(rawFilter);
  if (invalidFilter) {
    throw new Error(formatInvalidArtifactFilter(invalidFilter));
  }
  const readArtifact = options.readArtifact ?? (async () => "");
  const matches =
    filter === "failures"
      ? await buildFailureMatches(artifacts, readArtifact, limit)
      : filter === "active-task"
        ? buildActiveTaskMatches(options.relatedArtifacts, limit)
        : filterArtifacts(artifacts, filter).slice(0, limit).map(item => item.path);
  const grouped = new Map<string, string[]>();
  if (filter === "failures") {
    grouped.set("recent failures", matches);
  } else if (filter === "active-task") {
    grouped.set("recent active-task", matches);
  } else {
    for (const artifact of filterArtifacts(artifacts, filter).slice(0, limit)) {
      const bucket = grouped.get(artifact.type) ?? [];
      bucket.push(artifact.path);
      grouped.set(artifact.type, bucket);
    }
  }

  return {
    mode: "recent",
    filter,
    phase: status.phase,
    taskId: status.activeTaskId,
    taskText: status.activeTaskText,
    matches,
    groups:
      filter !== null
        ? [
            {
              label: filter === "active-task" ? "recent active-task" : filter === "failures" ? "recent failures" : `recent ${filter}`,
              matches
            }
          ]
        : [...grouped.entries()].map(([label, entries]) => ({ label: `recent ${label}`, matches: entries })),
    summary:
      matches.length > 0
        ? `Showing ${matches.length} recent ${filter ?? "artifacts"}.`
        : `No recent ${filter ?? "artifacts"} found.`
  };
}

export function runRecent(payload: RecentPayload): string {
  return [
    payload.summary,
    `Phase: ${payload.phase}`,
    `Task context: ${payload.taskId ?? "-"}${payload.taskText ? ` ${payload.taskText}` : ""}`,
    ...payload.groups.flatMap(group => [`${group.label}:`, group.matches.length > 0 ? group.matches.join(" | ") : "(none)"])
  ].join("\n");
}
