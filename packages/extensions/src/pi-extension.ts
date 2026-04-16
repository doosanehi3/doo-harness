import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createPiHostedHarnessBridge, type PiHostedHarnessBridge } from "./pi-hosted.js";

const WIDGET_KEY = "harness-command-result";
const bridgeByCwd = new Map<string, PiHostedHarnessBridge>();

function getBridge(cwd: string): PiHostedHarnessBridge {
  const cached = bridgeByCwd.get(cwd);
  if (cached) {
    return cached;
  }
  const bridge = createPiHostedHarnessBridge({ cwd, sessionId: `pi:${cwd}` });
  bridgeByCwd.set(cwd, bridge);
  return bridge;
}

function tryParseJson(output: string): unknown | null {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function formatWidgetFromPayload(payload: unknown): string[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as Record<string, unknown>;

  if (typeof value.overview === "string" && Array.isArray(value.commandGroups)) {
    const firstGroup = value.commandGroups[0] as { title?: string; commands?: string[] } | undefined;
    return [
      "Harness",
      value.overview,
      `Focus: ${typeof value.contextual === "object" && value.contextual && typeof (value.contextual as { focus?: string }).focus === "string" ? (value.contextual as { focus: string }).focus : "-"}`,
      firstGroup?.title ? `Group: ${firstGroup.title}` : "Group: -",
      ...(firstGroup?.commands?.slice(0, 4) ?? [])
    ];
  }

  if (value.mode === "history" && Array.isArray(value.history)) {
    return [
      "Harness Review History",
      `Items: ${(value.history as string[]).length}`,
      ...(value.history as string[]).slice(0, 4)
    ];
  }

  if (value.mode === "lanes") {
    return [
      "Harness Lanes",
      `Phase: ${typeof value.phase === "string" ? value.phase : "-"}`,
      `Active: ${typeof value.active === "object" && value.active && typeof (value.active as { taskId?: string | null }).taskId === "string" ? (value.active as { taskId: string }).taskId : "-"}`,
      `Owner: ${typeof value.active === "object" && value.active && typeof (value.active as { owner?: string | null }).owner === "string" ? (value.active as { owner: string }).owner : "-"}`,
      `Execution: ${typeof value.active === "object" && value.active && typeof (value.active as { executionMode?: string }).executionMode === "string" ? (value.active as { executionMode: string }).executionMode : "-"}`,
      ...(Array.isArray(value.ready) ? (value.ready as Array<{ taskId?: string; owner?: string }>).slice(0, 2).map(item => `${item.taskId ?? "-"} [${item.owner ?? "-"}]`) : [])
    ];
  }

  if (value.mode === "readiness") {
    return [
      "Harness Readiness",
      `Phase: ${typeof value.phase === "string" ? value.phase : "-"}`,
      `Config: ${value.configReady === true ? "ready" : "missing"}`,
      `Provider: ${value.providerReady === true ? "ready" : "needs attention"}`,
      `Handoff: ${value.handoffReady === true ? "ready" : "not ready"}`,
      `Recommended: ${typeof value.recommendedCommand === "string" ? value.recommendedCommand : "-"}`,
      `Summary: ${typeof value.summary === "string" ? value.summary : "-"}`
    ];
  }

  if (value.mode === "ship") {
    return [
      "Harness Ship",
      `Phase: ${typeof value.phase === "string" ? value.phase : "-"}`,
      `Ready: ${value.shipReady === true ? "yes" : "no"}`,
      `Recommended: ${typeof value.recommendedCommand === "string" ? value.recommendedCommand : "-"}`,
      `Summary: ${typeof value.summary === "string" ? value.summary : "-"}`,
      ...(Array.isArray(value.releaseChecks) ? (value.releaseChecks as string[]).slice(0, 2).map(item => `Check: ${item}`) : [])
    ];
  }

  if (value.mode === "today") {
    return [
      "Harness Today",
      `Phase: ${typeof value.phase === "string" ? value.phase : "-"}`,
      `Goal: ${typeof value.goal === "string" ? value.goal : "-"}`,
      `Next: ${typeof value.nextAction === "string" ? value.nextAction : "-"}`,
      `Summary: ${typeof value.summary === "string" ? value.summary : "-"}`,
      `Blocked: ${typeof value.blockerCount === "number" ? value.blockerCount : "-"}`,
      `Queue: ${typeof value.reviewQueueCount === "number" ? value.reviewQueueCount : "-"}`,
      `Lane: ${typeof value.activeLane === "object" && value.activeLane && typeof (value.activeLane as { taskId?: string | null }).taskId === "string" ? (value.activeLane as { taskId: string }).taskId : "-"}`,
      `Readiness: ${typeof value.readinessRecommendedCommand === "string" ? value.readinessRecommendedCommand : "-"}`,
      `Ship: ${typeof value.shipRecommendedCommand === "string" ? value.shipRecommendedCommand : "-"}`
    ];
  }

  if (value.mode === "handoff-inspect") {
    return [
      "Harness Handoff",
      `Phase: ${typeof value.phase === "string" ? value.phase : "-"}`,
      `Path: ${typeof value.path === "string" ? value.path : "-"}`,
      `Cleanup: ${value.cleanupEligible === true ? "eligible" : "not eligible"}`,
      ...(Array.isArray(value.preview) ? (value.preview as string[]).slice(0, 3) : [])
    ];
  }

  if (value.mode === "handoff-cleanup") {
    return [
      "Harness Handoff Cleanup",
      `Cleared: ${value.cleared === true ? "yes" : "no"}`,
      `Previous: ${typeof value.previousPath === "string" ? value.previousPath : "-"}`,
      `Remaining: ${typeof value.remainingPath === "string" ? value.remainingPath : "-"}`,
      `Reason: ${typeof value.reason === "string" ? value.reason : "-"}`
    ];
  }

  if (value.mode === "artifact-inspect" && typeof value.artifact === "object" && value.artifact) {
    const artifact = value.artifact as { type?: string; path?: string };
    return [
      "Harness Artifact",
      `Type: ${artifact.type ?? "-"}`,
      `Path: ${artifact.path ?? "-"}`,
      `Resolved: ${typeof value.resolvedBy === "string" ? value.resolvedBy : "-"}`,
      ...(Array.isArray(value.preview) ? (value.preview as string[]).slice(0, 3) : [])
    ];
  }

  if (typeof value.path === "string" && Array.isArray(value.preview)) {
    const comparedRefs = Array.isArray(value.comparedRefs) ? (value.comparedRefs as string[]) : [];
    const synthesis = Array.isArray(value.synthesis) ? (value.synthesis as string[]) : [];
    return [
      `Harness Review${typeof value.mode === "string" ? ` (${value.mode})` : ""}`,
      `Path: ${value.path}`,
      `Target: ${typeof value.target === "string" ? value.target : "-"}`,
      `Verification: ${typeof value.verificationStatus === "string" ? value.verificationStatus : "-"}`,
      `Handoff: ${value.handoffEligible === true ? "ready" : "not ready"}`,
      ...(comparedRefs.length > 0 ? [`Compared: ${comparedRefs.length}`] : []),
      ...(value.preview as string[]).slice(0, 2),
      ...(synthesis.length > 0 ? [`Synthesis: ${synthesis[0]}`] : [])
    ];
  }

  if ((value.mode === "find" || value.mode === "grep" || value.mode === "recent") && Array.isArray(value.matches)) {
    return [
      `Harness ${String(value.mode)}`,
      `Query: ${typeof value.query === "string" ? value.query : "-"}`,
      `Task: ${typeof value.taskId === "string" ? value.taskId : "-"}`,
      ...(value.matches as string[]).slice(0, 5),
      `Truncated: ${value.truncated === true ? "yes" : "no"}`
    ];
  }

  if (value.mode === "blocked" && Array.isArray(value.items)) {
    return [
      "Harness Blocked",
      `Phase: ${typeof value.phase === "string" ? value.phase : "-"}`,
      ...(value.items as Array<{ taskId?: string; blocker?: string; recoveryRecommendation?: string }>).slice(0, 4).map(
        item => `${item.taskId ?? "-"}: ${item.blocker ?? "-"} :: ${item.recoveryRecommendation ?? "-"}`
      )
    ];
  }

  if (value.mode === "queue" && Array.isArray(value.items)) {
    return [
      "Harness Queue",
      `Queue: ${typeof value.queue === "string" ? value.queue : "-"}`,
      ...(value.items as Array<{ label?: string; priority?: string; score?: number; recommendedCommand?: string }>).slice(0, 4).map(
        item => `${item.priority ?? "-"}${typeof item.score === "number" ? `/${item.score}` : ""}: ${item.label ?? "-"}${item.recommendedCommand ? ` -> ${item.recommendedCommand}` : ""}`
      )
    ];
  }

  if (value.mode === "pickup") {
    return [
      "Harness Pickup",
      `Kind: ${typeof value.pickupKind === "string" ? value.pickupKind : "-"}`,
      `Target: ${typeof value.target === "string" ? value.target : "-"}`,
      `Why: ${typeof value.rationale === "string" ? value.rationale : "-"}`,
      `Urgency: ${typeof value.urgency === "string" ? value.urgency : "-"}`,
      `Run: ${typeof value.recommendedCommand === "string" ? value.recommendedCommand : "-"}`,
      `Alternatives: ${Array.isArray(value.alternatives) ? (value.alternatives as string[]).join(" | ") || "-" : "-"}`,
      `Next: ${typeof value.nextAction === "string" ? value.nextAction : "-"}`
    ];
  }

  if (value.mode === "doctor" && Array.isArray(value.tools)) {
    return [
      "Harness Doctor",
      `${typeof value.summary === "string" ? value.summary : "doctor summary"}`,
      `Recommended: ${typeof value.recommendedCommand === "string" ? value.recommendedCommand : "-"}`,
      `Track: ${Array.isArray(value.validationTracks) && value.validationTracks.length > 0 ? String((value.validationTracks as Array<{ kind?: string }>)[0]?.kind ?? "-") : "-"}`,
      ...(value.tools as Array<{ name?: string; installed?: boolean }>).slice(0, 4).map(
        item => `${item.name ?? "-"}: ${item.installed ? "ready" : "missing"}`
      )
    ];
  }

  if (value.mode === "bootstrap" && Array.isArray(value.presets)) {
    return [
      "Harness Bootstrap",
      `${typeof value.summary === "string" ? value.summary : "bootstrap presets"}`,
      `Recommended: ${typeof value.recommendedPreset === "string" ? value.recommendedPreset : "-"}`,
      ...(value.presets as Array<{ id?: string }>).slice(0, 4).map(item => item.id ?? "-")
    ];
  }

  if (value.mode === "related" && Array.isArray(value.items)) {
    const exact = Array.isArray(value.groups)
      ? ((value.groups as Array<{ label?: string; items?: Array<{ path?: string }> }>).find(group => group.label === "exact")?.items ?? [])
      : [];
    return [
      "Harness Related",
      `Task: ${typeof value.targetTaskId === "string" ? value.targetTaskId : "-"}`,
      `Exact: ${exact.length}`,
      ...(value.items as Array<{ path?: string; relevance?: string }>).slice(0, 4).map(
        item => `${item.relevance ?? "supporting"}: ${item.path ?? "-"}`
      )
    ];
  }

  if (value.mode === "timeline" && Array.isArray(value.items)) {
    return [
      "Harness Timeline",
      `Phase: ${typeof value.phase === "string" ? value.phase : "-"}`,
      `Recovery: ${typeof value.recovery === "object" && value.recovery && typeof (value.recovery as { recommendation?: string }).recommendation === "string" ? (value.recovery as { recommendation: string }).recommendation : "-"}`,
      `Blocker: ${typeof value.recovery === "object" && value.recovery && typeof (value.recovery as { blocker?: string | null }).blocker === "string" ? (value.recovery as { blocker: string }).blocker : "-"}`,
      `Hint: ${typeof value.recovery === "object" && value.recovery && typeof (value.recovery as { recoveryHint?: string | null }).recoveryHint === "string" ? (value.recovery as { recoveryHint: string }).recoveryHint : "-"}`,
      ...(value.items as Array<{ label?: string }>).slice(0, 4).map(item => item.label ?? "-")
    ];
  }

  if (value.mode === "dashboard") {
    return [
      "Harness Dashboard",
      `Phase: ${typeof value.phase === "string" ? value.phase : "-"}`,
      `Handoff: ${typeof value.handoff === "object" && value.handoff && typeof (value.handoff as { eligible?: boolean }).eligible === "boolean" ? ((value.handoff as { eligible: boolean }).eligible ? "ready" : "not ready") : "-"}`,
      `Pickup: ${typeof value.pickup === "object" && value.pickup && typeof (value.pickup as { pickupKind?: string }).pickupKind === "string" ? (value.pickup as { pickupKind: string }).pickupKind : "-"}`,
      `Auto: ${typeof value.auto === "object" && value.auto && typeof (value.auto as { recommendedCommand?: string }).recommendedCommand === "string" ? (value.auto as { recommendedCommand: string }).recommendedCommand : "-"}`,
      `Blocked: ${typeof value.blocked === "object" && value.blocked && Array.isArray((value.blocked as { items?: unknown[] }).items) ? (value.blocked as { items: unknown[] }).items.length : 0}`,
      `Queue: ${typeof value.reviewQueue === "object" && value.reviewQueue && Array.isArray((value.reviewQueue as { items?: unknown[] }).items) ? (value.reviewQueue as { items: unknown[] }).items.length : 0}`,
      `Next: ${typeof value.nextAction === "string" ? value.nextAction : "-"}`
    ];
  }

  if (value.mode === "auto") {
    const pickup = typeof value.pickup === "object" && value.pickup ? (value.pickup as { pickupKind?: string; target?: string }) : null;
    return [
      "Harness Auto",
      `Entry: ${typeof value.entry === "string" ? value.entry : "-"}`,
      `Stop: ${typeof value.stopReason === "string" ? value.stopReason : "-"}`,
      `Goal: ${typeof value.goal === "string" ? value.goal : "-"}`,
      `Planned: ${value.startedNewPlan === true ? "yes" : "no"}`,
      `Pickup: ${pickup?.pickupKind ?? "-"}${pickup?.target ? ` -> ${pickup.target}` : ""}`,
      `Next: ${typeof value.nextAction === "string" ? value.nextAction : "-"}`,
      `Summary: ${typeof value.summary === "string" ? value.summary : "-"}`
    ];
  }

  if (typeof value.phase === "string") {
    const recentArtifacts = Array.isArray(value.recentArtifacts) ? (value.recentArtifacts as string[]).slice(0, 2) : [];
    return [
      "Harness Status",
      `Phase: ${value.phase}`,
      `Task: ${typeof value.activeTaskId === "string" ? value.activeTaskId : "-"}`,
      `Verification: ${typeof value.lastVerificationStatus === "string" ? value.lastVerificationStatus : "-"}`,
      `Blocker: ${typeof value.blocker === "string" ? value.blocker : "-"}`,
      `Next: ${typeof value.nextAction === "string" ? value.nextAction : "-"}`,
      ...recentArtifacts
    ];
  }

  return null;
}

function toWidgetLines(output: string, maxLines: number = 16): string[] {
  const payload = tryParseJson(output);
  const structured = formatWidgetFromPayload(payload);
  if (structured) {
    return structured.slice(0, maxLines);
  }
  return output.split("\n").slice(0, maxLines);
}

function summarize(input: string, output: string): string {
  const normalizedInput = input.trim();
  const payload = tryParseJson(output) as Record<string, unknown> | null;

  if (payload && payload.mode === "handoff-inspect") {
    return "Harness handoff inspect ready.";
  }
  if (payload && payload.mode === "handoff-cleanup") {
    return `Harness handoff cleanup: ${payload.cleared === true ? "cleared" : "unchanged"}`;
  }
  if (payload && payload.mode === "lanes") {
    return "Harness lanes ready.";
  }
  if (payload && payload.mode === "readiness") {
    return "Harness readiness ready.";
  }
  if (payload && payload.mode === "ship") {
    return "Harness ship ready.";
  }
  if (payload && payload.mode === "today") {
    return "Harness today ready.";
  }
  if (payload && payload.mode === "artifact-inspect") {
    return "Harness artifact inspect ready.";
  }
  if (payload && typeof payload.path === "string" && Array.isArray(payload.preview)) {
    return `Harness review ${typeof payload.mode === "string" ? payload.mode : "quick"} ready.`;
  }
  if (payload && (payload.mode === "find" || payload.mode === "grep" || payload.mode === "recent") && Array.isArray(payload.matches)) {
    return `Harness ${String(payload.mode)}: ${payload.matches.length} matches`;
  }
  if (payload && payload.mode === "blocked" && Array.isArray(payload.items)) {
    return `Harness blocked: ${payload.items.length} task(s)`;
  }
  if (payload && payload.mode === "queue" && Array.isArray(payload.items)) {
    return `Harness queue: ${payload.items.length} item(s)`;
  }
  if (payload && payload.mode === "pickup") {
    return `Harness pickup: ${typeof payload.pickupKind === "string" ? payload.pickupKind : "ready"}`;
  }
  if (payload && payload.mode === "doctor" && Array.isArray(payload.tools)) {
    return `Harness doctor: ${payload.tools.length} tool check(s)`;
  }
  if (payload && payload.mode === "bootstrap" && Array.isArray(payload.presets)) {
    return `Harness bootstrap: ${payload.presets.length} preset(s)`;
  }
  if (payload && payload.mode === "related" && Array.isArray(payload.items)) {
    return `Harness related: ${payload.items.length} item(s)`;
  }
  if (payload && payload.mode === "timeline" && Array.isArray(payload.items)) {
    return `Harness timeline: ${payload.items.length} event(s)`;
  }
  if (payload && payload.mode === "dashboard") {
    return "Harness dashboard ready.";
  }
  if (payload && payload.mode === "auto") {
    return `Harness auto: ${typeof payload.stopReason === "string" ? payload.stopReason : "ready"}`;
  }
  if (payload && typeof payload.phase === "string") {
    const task = typeof payload.activeTaskId === "string" ? ` ${payload.activeTaskId}` : "";
    return `Harness status: ${payload.phase}${task}`;
  }
  if (normalizedInput.includes("help")) {
    return "Harness help ready.";
  }

  const first = output.split("\n").find(line => line.trim().length > 0);
  if (!first) {
    return "Harness command executed.";
  }
  const trimmed = first.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "Harness command executed.";
  }
  return trimmed;
}

export default function harnessPiExtension(pi: ExtensionAPI): void {
  pi.registerCommand("harness", {
    description: "Run Harness runtime commands inside pi",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const bridge = getBridge(ctx.cwd);
      const input = args.trim() || "status --json";
      const output = await bridge.execute(input);
      const widgetLines = toWidgetLines(output);
      const message = summarize(input, output);

      pi.appendEntry?.("harness-command-result", {
        cwd: ctx.cwd,
        input,
        output,
        message,
        widgetLines
      });

      if (ctx.hasUI !== false) {
        ctx.ui?.setWidget?.(WIDGET_KEY, widgetLines, {
          placement: "belowEditor"
        });
      } else {
        process.stdout.write(`${output}\n`);
      }
      ctx.ui?.notify?.(message, "info");
    }
  });
}
