import type { BlockedPayload, PickupPayload, QueuePayload } from "@doo/harness-runtime";

export function runBlocked(payload: BlockedPayload): string {
  return [
    payload.summary,
    `Phase: ${payload.phase}`,
    `Active task: ${payload.activeTaskId ?? "-"}${payload.activeTaskText ? ` ${payload.activeTaskText}` : ""}`,
    ...payload.items.flatMap(item => [
      `${item.taskId}: ${item.taskText ?? "-"}`,
      `  blocker=${item.blocker}`,
      `  recovery=${item.recoveryHint ?? "-"}`,
      `  milestone=${item.milestoneId ?? "-"}`
    ])
  ].join("\n");
}

export function runQueue(payload: QueuePayload): string {
  return [
    payload.summary,
    `Queue: ${payload.queue}`,
    `Phase: ${payload.phase}`,
    `Active task: ${payload.activeTaskId ?? "-"}${payload.activeTaskText ? ` ${payload.activeTaskText}` : ""}`,
    ...payload.items.flatMap(item => [`- ${item.kind}: ${item.label}`, `  ${item.detail}`])
  ].join("\n");
}

export function runPickup(payload: PickupPayload): string {
  return [
    `Pickup: ${payload.pickupKind}`,
    `Phase: ${payload.phase}`,
    `Active task: ${payload.activeTaskId ?? "-"}${payload.activeTaskText ? ` ${payload.activeTaskText}` : ""}`,
    `Target: ${payload.target ?? "-"}`,
    `Blocker: ${payload.blocker ?? "-"}`,
    `Ready tasks: ${payload.readyTasks.length > 0 ? payload.readyTasks.join(" | ") : "-"}`,
    `Pending dependencies: ${payload.pendingDependencies.length > 0 ? payload.pendingDependencies.join(" | ") : "-"}`,
    `Next: ${payload.nextAction ?? "-"}`
  ].join("\n");
}
