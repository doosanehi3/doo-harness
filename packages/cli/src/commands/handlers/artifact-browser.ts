import type { RelatedArtifactsPayload, TimelinePayload } from "@doo/harness-runtime";

export function runRelatedArtifacts(payload: RelatedArtifactsPayload): string {
  return [
    payload.summary,
    `Phase: ${payload.phase}`,
    `Target task: ${payload.targetTaskId ?? "-"}${payload.targetTaskText ? ` ${payload.targetTaskText}` : ""}`,
    ...payload.groups.flatMap(group => [
      `${group.label}:`,
      ...group.items.flatMap(item => [`- ${item.kind}/${item.type}: ${item.path}`, `  ${item.reason}`])
    ])
  ].join("\n");
}

export function runTimeline(payload: TimelinePayload): string {
  return [
    payload.summary,
    `Phase: ${payload.phase}`,
    `Active task: ${payload.activeTaskId ?? "-"}${payload.activeTaskText ? ` ${payload.activeTaskText}` : ""}`,
    `Recovery latest failure: ${payload.recovery.latestFailurePath ?? "-"}`,
    `Recovery latest pass: ${payload.recovery.latestPassPath ?? "-"}`,
    `Recovery latest handoff: ${payload.recovery.latestHandoffPath ?? "-"}`,
    `Recovery blocker: ${payload.recovery.blocker ?? "-"}`,
    `Recovery hint: ${payload.recovery.recoveryHint ?? "-"}`,
    `Recovery next: ${payload.recovery.recommendation ?? "-"}`,
    ...payload.items.flatMap(item => [
      `- ${item.timestamp} ${item.kind} ${item.label}`,
      `  ${item.detail}${item.path ? ` :: ${item.path}` : ""}`
    ])
  ].join("\n");
}
