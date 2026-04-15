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
      firstGroup?.title ? `Group: ${firstGroup.title}` : "Group: -",
      ...(firstGroup?.commands?.slice(0, 4) ?? [])
    ];
  }

  if (typeof value.path === "string" && Array.isArray(value.preview)) {
    return [
      `Harness Review${typeof value.mode === "string" ? ` (${value.mode})` : ""}`,
      `Path: ${value.path}`,
      `Target: ${typeof value.target === "string" ? value.target : "-"}`,
      `Verification: ${typeof value.verificationStatus === "string" ? value.verificationStatus : "-"}`,
      `Handoff: ${value.handoffEligible === true ? "ready" : "not ready"}`,
      ...(value.preview as string[]).slice(0, 3)
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
      ...(value.items as Array<{ taskId?: string; blocker?: string }>).slice(0, 4).map(
        item => `${item.taskId ?? "-"}: ${item.blocker ?? "-"}`
      )
    ];
  }

  if (value.mode === "queue" && Array.isArray(value.items)) {
    return [
      "Harness Queue",
      `Queue: ${typeof value.queue === "string" ? value.queue : "-"}`,
      ...(value.items as Array<{ label?: string }>).slice(0, 4).map(item => item.label ?? "-")
    ];
  }

  if (value.mode === "pickup") {
    return [
      "Harness Pickup",
      `Kind: ${typeof value.pickupKind === "string" ? value.pickupKind : "-"}`,
      `Target: ${typeof value.target === "string" ? value.target : "-"}`,
      `Next: ${typeof value.nextAction === "string" ? value.nextAction : "-"}`
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
