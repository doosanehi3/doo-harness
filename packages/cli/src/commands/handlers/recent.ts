import type { ArtifactMeta, ArtifactType, RuntimeStatus } from "@doo/harness-runtime";
import { filterArtifacts, parseArtifactFilter } from "./artifacts.js";

export interface RecentPayload {
  mode: "recent";
  filter: ArtifactType | null;
  phase: string;
  taskId: string | null;
  taskText: string | null;
  matches: string[];
  groups: Array<{ label: string; matches: string[] }>;
  summary: string;
}

export function buildRecentPayload(
  artifacts: ArtifactMeta[],
  rawFilter: string,
  status: RuntimeStatus,
  limit: number = 5
): RecentPayload {
  const { filter } = parseArtifactFilter(rawFilter);
  const filtered = filterArtifacts(artifacts, filter).slice(0, limit);
  const matches = filtered.map(item => item.path);
  const grouped = new Map<string, string[]>();
  for (const artifact of filtered) {
    const bucket = grouped.get(artifact.type) ?? [];
    bucket.push(artifact.path);
    grouped.set(artifact.type, bucket);
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
              label: `recent ${filter}`,
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
