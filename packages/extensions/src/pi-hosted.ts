import { createPiSubstrateAdapter, type PiSubstrateAdapter } from "../../ai/src/index.js";
import { HarnessRuntime } from "../../harness-runtime/src/index.js";
import { formatInvalidArtifactFilter, parseArtifactFilter, runArtifacts } from "../../cli/src/commands/handlers/artifacts.js";
import { runRelatedArtifacts, runTimeline } from "../../cli/src/commands/handlers/artifact-browser.js";
import { runContinue } from "../../cli/src/commands/handlers/continue.js";
import { runBlocked, runPickup, runQueue } from "../../cli/src/commands/handlers/entrypoints.js";
import { buildHelpPayload, runHelp } from "../../cli/src/commands/handlers/help.js";
import { runHandoff } from "../../cli/src/commands/handlers/handoff.js";
import { runLongRun } from "../../cli/src/commands/handlers/longrun.js";
import { normalizeCommandString } from "../../cli/src/commands/normalize-input.js";
import { buildBootstrapPayload, buildDoctorPayload, formatInvalidBootstrapPreset, parseBootstrapPreset, runBootstrap, runDoctor } from "../../cli/src/commands/handlers/onboarding.js";
import { runPlan } from "../../cli/src/commands/handlers/plan.js";
import { buildRecentPayload, runRecent } from "../../cli/src/commands/handlers/recent.js";
import { runReset } from "../../cli/src/commands/handlers/reset.js";
import { runResume } from "../../cli/src/commands/handlers/resume.js";
import { buildArtifactReviewPayload, buildReviewHistoryPayload, buildReviewPayload, runReview, type ReviewMode } from "../../cli/src/commands/handlers/review.js";
import { buildFindPayload, buildGrepPayload, buildRecentSearchPayload, runSearch } from "../../cli/src/commands/handlers/search.js";
import { buildCompactStatusView, buildDashboardStatusView, buildStatusView, runCompactStatus, runDashboardStatus, runStatus } from "../../cli/src/commands/handlers/status.js";
import { runVerify } from "../../cli/src/commands/handlers/verify.js";

export interface PiHostedHarnessHost {
  cwd: string;
  sessionId?: string | null;
  allowedTools?: string[];
}

export interface PiHostedHarnessBridge {
  execute(input: string): Promise<string>;
  getRuntime(): Promise<HarnessRuntime>;
}

function createHostedAdapter(host: PiHostedHarnessHost): PiSubstrateAdapter {
  return createPiSubstrateAdapter({
    session: {
      cwd: host.cwd,
      sessionId: host.sessionId ?? null
    },
    tools: {
      getAllowedTools: () => host.allowedTools ?? ["read", "write", "edit", "bash"]
    }
  });
}

async function executeHostedCommand(runtime: HarnessRuntime, cwd: string, input: string): Promise<string> {
  const trimmed = normalizeCommandString(input);
  const statusPayload = buildStatusView(runtime.getStatus(), await runtime.listArtifacts());

  if (trimmed === "/help") {
    return runHelp();
  }
  if (trimmed === "/help-json") {
    return JSON.stringify(buildHelpPayload(), null, 2);
  }
  if (trimmed === "/doctor") {
    return runDoctor(await buildDoctorPayload(cwd, runtime.getProviderReadiness()));
  }
  if (trimmed === "/doctor-json") {
    return JSON.stringify(await buildDoctorPayload(cwd, runtime.getProviderReadiness()), null, 2);
  }
  if (trimmed === "/status") {
    return runStatus(statusPayload);
  }
  if (trimmed === "/status-json") {
    return JSON.stringify(statusPayload, null, 2);
  }
  if (trimmed === "/status-compact" || trimmed === "/status compact") {
    return runCompactStatus(buildCompactStatusView(runtime.getStatus(), await runtime.listArtifacts()));
  }
  if (trimmed === "/status-compact-json" || trimmed === "/status compact --json") {
    return JSON.stringify(buildCompactStatusView(runtime.getStatus(), await runtime.listArtifacts()), null, 2);
  }
  if (trimmed === "/status-dashboard" || trimmed === "/status dashboard") {
    return runDashboardStatus(
      buildDashboardStatusView(
        runtime.getStatus(),
        await runtime.listArtifacts(),
        runtime.getBlockedPayload(),
        await runtime.getReviewQueuePayload(),
        runtime.getPickupPayload()
      )
    );
  }
  if (trimmed === "/status-dashboard-json" || trimmed === "/status dashboard --json") {
    return JSON.stringify(
      buildDashboardStatusView(
        runtime.getStatus(),
        await runtime.listArtifacts(),
        runtime.getBlockedPayload(),
        await runtime.getReviewQueuePayload(),
        runtime.getPickupPayload()
      ),
      null,
      2
    );
  }
  if (trimmed === "/artifacts" || trimmed.startsWith("/artifacts ")) {
    const { filter, invalidFilter } = parseArtifactFilter(trimmed.replace(/^\/artifacts\s*/, ""));
    if (invalidFilter) {
      return formatInvalidArtifactFilter(invalidFilter);
    }
    return runArtifacts(await runtime.listArtifacts(), filter);
  }
  if (trimmed === "/artifacts-json" || trimmed.startsWith("/artifacts-json ")) {
    const { filter, invalidFilter } = parseArtifactFilter(trimmed.replace(/^\/artifacts-json\s*/, ""));
    if (invalidFilter) {
      return JSON.stringify({ error: formatInvalidArtifactFilter(invalidFilter) }, null, 2);
    }
    const artifacts = await runtime.listArtifacts();
    return JSON.stringify(filter ? artifacts.filter(artifact => artifact.type === filter) : artifacts, null, 2);
  }
  if (trimmed === "/artifacts-related" || trimmed.startsWith("/artifacts-related ")) {
    const rawTaskId = trimmed.replace(/^\/artifacts-related\s*/, "").trim();
    return runRelatedArtifacts(runtime.getRelatedArtifactsPayload(rawTaskId || undefined));
  }
  if (trimmed === "/artifacts-related-json" || trimmed.startsWith("/artifacts-related-json ")) {
    const rawTaskId = trimmed.replace(/^\/artifacts-related-json\s*/, "").trim();
    return JSON.stringify(runtime.getRelatedArtifactsPayload(rawTaskId || undefined), null, 2);
  }
  if (trimmed === "/timeline") {
    return runTimeline(await runtime.getTimelinePayload());
  }
  if (trimmed === "/timeline-json") {
    return JSON.stringify(await runtime.getTimelinePayload(), null, 2);
  }
  if (trimmed.startsWith("/plan-json")) {
    const goal = trimmed.replace(/^\/plan-json\s*/, "").trim();
    const result = await runtime.plan(goal || "(empty goal)", false);
    return JSON.stringify({ ...result, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed.startsWith("/plan")) {
    const goal = trimmed.replace(/^\/plan\s*/, "").trim();
    const result = await runtime.plan(goal || "(empty goal)", false);
    return runPlan(result.planPath);
  }
  if (trimmed.startsWith("/longrun-json")) {
    const goal = trimmed.replace(/^\/longrun-json\s*/, "").trim();
    const result = await runtime.plan(goal || "(empty goal)", true);
    return JSON.stringify({ ...result, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed.startsWith("/longrun")) {
    const goal = trimmed.replace(/^\/longrun\s*/, "").trim();
    const result = await runtime.plan(goal || "(empty goal)", true);
    return runLongRun(result.planPath, result.milestonePath ?? "(none)");
  }
  if (trimmed === "/continue") {
    return runContinue(await runtime.continueTaskLoop());
  }
  if (trimmed === "/continue-json") {
    return JSON.stringify({ result: await runtime.continueTaskLoop(), status: runtime.getStatus() }, null, 2);
  }
  if (trimmed === "/blocked") {
    return runBlocked(runtime.getBlockedPayload());
  }
  if (trimmed === "/blocked-json") {
    return JSON.stringify(runtime.getBlockedPayload(), null, 2);
  }
  if (trimmed.startsWith("/find-json")) {
    const query = trimmed.replace(/^\/find-json\s*/, "");
    return JSON.stringify(await buildFindPayload(cwd, query, runtime.getStatus()), null, 2);
  }
  if (trimmed.startsWith("/find")) {
    const query = trimmed.replace(/^\/find\s*/, "");
    return runSearch(await buildFindPayload(cwd, query, runtime.getStatus()));
  }
  if (trimmed.startsWith("/grep-json")) {
    const query = trimmed.replace(/^\/grep-json\s*/, "");
    return JSON.stringify(await buildGrepPayload(cwd, query, runtime.getStatus()), null, 2);
  }
  if (trimmed.startsWith("/grep")) {
    const query = trimmed.replace(/^\/grep\s*/, "");
    return runSearch(await buildGrepPayload(cwd, query, runtime.getStatus()));
  }
  if (trimmed === "/recent" || trimmed.startsWith("/recent ")) {
    const filter = trimmed.replace(/^\/recent\s*/, "");
    const parsed = parseArtifactFilter(filter);
    if (parsed.invalidFilter) {
      return formatInvalidArtifactFilter(parsed.invalidFilter);
    }
    return runRecent(buildRecentPayload(await runtime.listArtifacts(), filter, runtime.getStatus()));
  }
  if (trimmed === "/recent-json" || trimmed.startsWith("/recent-json ")) {
    const filter = trimmed.replace(/^\/recent-json\s*/, "");
    const parsed = parseArtifactFilter(filter);
    if (parsed.invalidFilter) {
      return JSON.stringify({ error: formatInvalidArtifactFilter(parsed.invalidFilter) }, null, 2);
    }
    return JSON.stringify(
      buildRecentSearchPayload(await runtime.listArtifacts(), filter, cwd, runtime.getStatus()),
      null,
      2
    );
  }
  if (trimmed === "/queue-review") {
    return runQueue(await runtime.getReviewQueuePayload());
  }
  if (trimmed === "/queue-review-json") {
    return JSON.stringify(await runtime.getReviewQueuePayload(), null, 2);
  }
  if (trimmed === "/pickup") {
    return runPickup(runtime.getPickupPayload());
  }
  if (trimmed === "/pickup-json") {
    return JSON.stringify(runtime.getPickupPayload(), null, 2);
  }
  if (trimmed === "/bootstrap" || trimmed.startsWith("/bootstrap ")) {
    const parsed = parseBootstrapPreset(trimmed.replace(/^\/bootstrap\s*/, ""));
    if (parsed.invalidPreset) {
      return formatInvalidBootstrapPreset(parsed.invalidPreset);
    }
    return runBootstrap(buildBootstrapPayload(parsed.preset));
  }
  if (trimmed === "/bootstrap-json" || trimmed.startsWith("/bootstrap-json ")) {
    const parsed = parseBootstrapPreset(trimmed.replace(/^\/bootstrap-json\s*/, ""));
    if (parsed.invalidPreset) {
      return JSON.stringify({ error: formatInvalidBootstrapPreset(parsed.invalidPreset) }, null, 2);
    }
    return JSON.stringify(buildBootstrapPayload(parsed.preset), null, 2);
  }
  if (trimmed === "/verify") {
    return runVerify((await runtime.verify()).path);
  }
  if (trimmed === "/verify-json") {
    const verification = await runtime.verify();
    return JSON.stringify({ ...verification, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed === "/review" || trimmed.startsWith("/review ")) {
    const raw = trimmed.replace(/^\/review\s*/, "").trim();
    const [subcommand, ...rest] = raw.split(/\s+/).filter(Boolean);
    const artifacts = await runtime.listArtifacts();
    if (subcommand === "history") {
      return runReview(buildReviewHistoryPayload(artifacts, runtime.getStatus()));
    }
    if (subcommand === "artifact") {
      return runReview(await buildArtifactReviewPayload(rest.join(" "), artifacts, runtime.getStatus()));
    }
    const mode: ReviewMode = subcommand === "diff" || subcommand === "deep" ? subcommand : "quick";
    const target = mode === "diff" ? rest.join(" ") || null : null;
    const path = await runtime.review();
    return runReview(
      await buildReviewPayload(path, runtime.getStatus(), {
        mode,
        cwd,
        artifacts,
        target
      })
    );
  }
  if (trimmed === "/review-json" || trimmed.startsWith("/review-json ")) {
    const raw = trimmed.replace(/^\/review-json\s*/, "").trim();
    const [subcommand, ...rest] = raw.split(/\s+/).filter(Boolean);
    const artifacts = await runtime.listArtifacts();
    if (subcommand === "history") {
      return JSON.stringify({ ...buildReviewHistoryPayload(artifacts, runtime.getStatus()), status: runtime.getStatus() }, null, 2);
    }
    if (subcommand === "artifact") {
      return JSON.stringify(
        {
          ...(await buildArtifactReviewPayload(rest.join(" "), artifacts, runtime.getStatus())),
          status: runtime.getStatus()
        },
        null,
        2
      );
    }
    const mode: ReviewMode = subcommand === "diff" || subcommand === "deep" ? subcommand : "quick";
    const target = mode === "diff" ? rest.join(" ") || null : null;
    const path = await runtime.review();
    return JSON.stringify(
      {
        ...(await buildReviewPayload(path, runtime.getStatus(), {
          mode,
          cwd,
          artifacts,
          target
        })),
        status: runtime.getStatus()
      },
      null,
      2
    );
  }
  if (trimmed === "/handoff") {
    return runHandoff(await runtime.createHandoff());
  }
  if (trimmed === "/handoff-json") {
    return JSON.stringify({ path: await runtime.createHandoff() }, null, 2);
  }
  if (trimmed === "/resume") {
    return runResume(await runtime.resume());
  }
  if (trimmed === "/resume-json") {
    const phase = await runtime.resume();
    return JSON.stringify({ phase, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed === "/reset") {
    return `${runReset()}\n${await runtime.reset()}`;
  }
  if (trimmed === "/reset-json") {
    return JSON.stringify({ result: await runtime.reset(), status: runtime.getStatus() }, null, 2);
  }

  return runtime.handleInput(trimmed);
}

export function createPiHostedHarnessBridge(host: PiHostedHarnessHost): PiHostedHarnessBridge {
  const runtimePromise = HarnessRuntime.create(host.cwd, host.sessionId ?? "pi-hosted-session", {
    substrateAdapter: createHostedAdapter(host)
  });

  return {
    async getRuntime(): Promise<HarnessRuntime> {
      return runtimePromise;
    },
    async execute(input: string): Promise<string> {
      const runtime = await runtimePromise;
      return executeHostedCommand(runtime, host.cwd, input);
    }
  };
}
