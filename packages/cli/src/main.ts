import { createProcessPiSubstrateAdapter } from "../../ai/src/index.js";
import { HarnessRuntime, writeDefaultRuntimeConfig } from "../../harness-runtime/src/index.js";
import { fileURLToPath } from "node:url";
import { formatInvalidArtifactFilter, parseArtifactFilter, runArtifacts } from "./commands/handlers/artifacts.js";
import { runRelatedArtifacts, runTimeline } from "./commands/handlers/artifact-browser.js";
import { runAdvance } from "./commands/handlers/advance.js";
import { runAuto } from "./commands/handlers/auto.js";
import { runBlock } from "./commands/handlers/block.js";
import { runContinue } from "./commands/handlers/continue.js";
import { runConfigInit, runConfigShow } from "./commands/handlers/config-init.js";
import { runExecute } from "./commands/handlers/execute.js";
import { runBlocked, runPickup, runQueue } from "./commands/handlers/entrypoints.js";
import { runHandoff } from "./commands/handlers/handoff.js";
import { buildHelpPayload, runHelp } from "./commands/handlers/help.js";
import { runLongRun } from "./commands/handlers/longrun.js";
import { runLoop } from "./commands/handlers/loop.js";
import { runPlan } from "./commands/handlers/plan.js";
import { runProviderCheck } from "./commands/handlers/provider-check.js";
import { runProviderDoctor } from "./commands/handlers/provider-doctor.js";
import { runProviderSmoke } from "./commands/handlers/provider-smoke.js";
import { buildRecentPayload, runRecent } from "./commands/handlers/recent.js";
import { buildBootstrapPayload, buildDoctorPayload, formatInvalidBootstrapPreset, parseBootstrapPreset, runBootstrap, runDoctor } from "./commands/handlers/onboarding.js";
import { runReset } from "./commands/handlers/reset.js";
import { buildArtifactReviewPayload, buildReviewHistoryPayload, buildReviewPayload, runReview, type ReviewMode } from "./commands/handlers/review.js";
import { buildFindPayload, buildGrepPayload, buildRecentSearchPayload, runSearch } from "./commands/handlers/search.js";
import { runResume } from "./commands/handlers/resume.js";
import { buildCompactStatusView, buildDashboardStatusView, buildStatusView, runCompactStatus, runDashboardStatus, runStatus } from "./commands/handlers/status.js";
import { runTaskDone } from "./commands/handlers/task-done.js";
import { runUnblock } from "./commands/handlers/unblock.js";
import { runVerify } from "./commands/handlers/verify.js";
import { runWebSmoke } from "./commands/handlers/web-smoke.js";
import { runWebVerify } from "./commands/handlers/web-verify.js";
import { renderRuntimePanel } from "../../tui/src/index.js";
import { normalizeCommandTokens } from "./commands/normalize-input.js";

function parseCliInvocation(argv: string[]): { runtimeCwd: string; input: string } {
  const args = [...argv];
  let runtimeCwd = process.env.HARNESS_CWD_OVERRIDE ?? process.cwd();

  while (args.length > 0) {
    const current = args[0];
    if (!current) break;
    if (current === "--") {
      args.shift();
      continue;
    }
    if (current === "--cwd") {
      args.shift();
      const next = args.shift();
      if (next) {
        runtimeCwd = next;
      }
      continue;
    }
    if (current.startsWith("--cwd=")) {
      runtimeCwd = current.slice("--cwd=".length) || runtimeCwd;
      args.shift();
      continue;
    }
    break;
  }

  return {
    runtimeCwd,
    input: normalizeCliInput(args)
  };
}

function normalizeCliInput(args: string[]): string {
  return normalizeCommandTokens(args);
}

async function execute(runtime: HarnessRuntime, rawInput: string, runtimeCwd: string): Promise<string> {
  const trimmed = rawInput.trim();
  const statusPayload = buildStatusView(runtime.getStatus(), await runtime.listArtifacts());

  if (trimmed === "" || trimmed === "/status") {
    return runStatus(statusPayload);
  }

  if (trimmed === "/help") {
    return runHelp();
  }

  if (trimmed === "/help-json") {
    return JSON.stringify(buildHelpPayload(), null, 2);
  }

  if (trimmed === "/doctor") {
    return runDoctor(await buildDoctorPayload(runtimeCwd, runtime.getProviderReadiness()));
  }

  if (trimmed === "/doctor-json") {
    return JSON.stringify(await buildDoctorPayload(runtimeCwd, runtime.getProviderReadiness()), null, 2);
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

  if (trimmed === "/config-init-openai-codex") {
    return runConfigInit(await writeDefaultRuntimeConfig(runtimeCwd, true, "openai-codex"), "openai-codex");
  }

  if (trimmed.startsWith("/config-init")) {
    const force = /\s--force\b/.test(trimmed);
    const profileMatch = trimmed.match(/\s--profile\s+([a-z0-9-]+)/i);
    const profile = profileMatch?.[1] === "openai-codex" ? "openai-codex" : "default";
    return runConfigInit(await writeDefaultRuntimeConfig(runtimeCwd, force, profile), profile);
  }

  if (trimmed === "/config-show") {
    const { loadRuntimeConfig } = await import("../../harness-runtime/src/config/runtime-config.js");
    return runConfigShow(JSON.stringify(await loadRuntimeConfig(runtimeCwd), null, 2));
  }

  if (trimmed === "/provider-check") {
    return runProviderCheck(runtime.getProviderReadiness());
  }

  if (trimmed === "/provider-check-json") {
    return JSON.stringify(runtime.getProviderReadiness(), null, 2);
  }

  if (trimmed === "/provider-doctor") {
    return runProviderDoctor(await runtime.doctorProviders());
  }

  if (trimmed === "/provider-doctor-json") {
    return JSON.stringify(await runtime.doctorProviders(), null, 2);
  }

  if (trimmed.startsWith("/provider-smoke-json")) {
    const role = trimmed.replace(/^\/provider-smoke-json\s*/, "").trim();
    const target =
      role === "planner" || role === "worker" || role === "validator" ? role : "default";
    return JSON.stringify(await runtime.smokeProvider(target), null, 2);
  }

  if (trimmed.startsWith("/provider-smoke")) {
    const role = trimmed.replace(/^\/provider-smoke\s*/, "").trim();
    const target =
      role === "planner" || role === "worker" || role === "validator" ? role : "default";
    return runProviderSmoke(await runtime.smokeProvider(target));
  }

  if (trimmed === "/web-smoke") {
    return runWebSmoke(await runtime.smokeWebApp());
  }

  if (trimmed === "/web-smoke-json") {
    return JSON.stringify(await runtime.smokeWebApp(), null, 2);
  }

  if (trimmed === "/web-verify") {
    return runWebVerify(await runtime.verifyWebApp());
  }

  if (trimmed === "/web-verify-json") {
    return JSON.stringify(await runtime.verifyWebApp(), null, 2);
  }

  if (trimmed === "/advance") {
    return runAdvance(await runtime.advanceMilestone());
  }

  if (trimmed === "/advance-json") {
    return JSON.stringify({ result: await runtime.advanceMilestone(), status: runtime.getStatus() }, null, 2);
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
    return JSON.stringify(await buildFindPayload(runtimeCwd, query, runtime.getStatus()), null, 2);
  }

  if (trimmed.startsWith("/find")) {
    const query = trimmed.replace(/^\/find\s*/, "");
    return runSearch(await buildFindPayload(runtimeCwd, query, runtime.getStatus()));
  }

  if (trimmed.startsWith("/grep-json")) {
    const query = trimmed.replace(/^\/grep-json\s*/, "");
    return JSON.stringify(await buildGrepPayload(runtimeCwd, query, runtime.getStatus()), null, 2);
  }

  if (trimmed.startsWith("/grep")) {
    const query = trimmed.replace(/^\/grep\s*/, "");
    return runSearch(await buildGrepPayload(runtimeCwd, query, runtime.getStatus()));
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
      buildRecentSearchPayload(await runtime.listArtifacts(), filter, runtimeCwd, runtime.getStatus()),
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

  if (trimmed.startsWith("/loop-json")) {
    const rawSteps = trimmed.replace(/^\/loop-json\s*/, "").trim();
    const maxSteps = rawSteps === "" ? 10 : Number.parseInt(rawSteps, 10);
    return JSON.stringify(await runtime.runCompletionLoopDetailed(Number.isNaN(maxSteps) ? 10 : maxSteps), null, 2);
  }

  if (trimmed.startsWith("/loop")) {
    const rawSteps = trimmed.replace(/^\/loop\s*/, "").trim();
    const maxSteps = rawSteps === "" ? 10 : Number.parseInt(rawSteps, 10);
    return runLoop(await runtime.runCompletionLoop(Number.isNaN(maxSteps) ? 10 : maxSteps));
  }

  if (trimmed === "/handoff") {
    return runHandoff(await runtime.createHandoff());
  }

  if (trimmed === "/handoff-json") {
    return JSON.stringify(
      {
        path: await runtime.createHandoff(),
        status: runtime.getStatus()
      },
      null,
      2
    );
  }

  if (trimmed === "/execute") {
    const status = runtime.getStatus();
    const taskId =
      status.flow === "worker_validator"
        ? await runtime.enterWorkerValidator(status.goalSummary ?? undefined)
        : await runtime.executeCurrentTask();
    return runExecute(taskId);
  }

  if (trimmed === "/execute-json") {
    const status = runtime.getStatus();
    const taskId =
      status.flow === "worker_validator"
        ? await runtime.enterWorkerValidator(status.goalSummary ?? undefined)
        : await runtime.executeCurrentTask();
    return JSON.stringify({ taskId, status: runtime.getStatus() }, null, 2);
  }

  if (trimmed === "/task-done") {
    return runTaskDone(await runtime.completeCurrentTask());
  }

  if (trimmed.startsWith("/block-json")) {
    const reason = trimmed.replace(/^\/block-json\s*/, "").trim() || "Blocked by user";
    return JSON.stringify({ result: await runtime.blockCurrentTask(reason), status: runtime.getStatus() }, null, 2);
  }

  if (trimmed.startsWith("/block")) {
    const reason = trimmed.replace(/^\/block\s*/, "").trim() || "Blocked by user";
    return runBlock(await runtime.blockCurrentTask(reason));
  }

  if (trimmed === "/unblock") {
    return runUnblock(await runtime.unblockCurrentTask());
  }

  if (trimmed === "/unblock-json") {
    return JSON.stringify({ result: await runtime.unblockCurrentTask(), status: runtime.getStatus() }, null, 2);
  }

  if (trimmed.startsWith("/plan-json")) {
    const goal = trimmed.replace(/^\/plan-json\s*/, "").trim() || "Current task";
    return JSON.stringify({ ...(await runtime.plan(goal, false)), status: runtime.getStatus() }, null, 2);
  }

  if (trimmed.startsWith("/plan")) {
    const goal = trimmed.replace(/^\/plan\s*/, "").trim() || "Current task";
    const result = await runtime.plan(goal, false);
    return runPlan(result.planPath);
  }

  if (trimmed.startsWith("/longrun-json")) {
    const goal = trimmed.replace(/^\/longrun-json\s*/, "").trim() || "Current long-running task";
    return JSON.stringify({ ...(await runtime.plan(goal, true)), status: runtime.getStatus() }, null, 2);
  }

  if (trimmed.startsWith("/longrun")) {
    const goal = trimmed.replace(/^\/longrun\s*/, "").trim() || "Current long-running task";
    const result = await runtime.plan(goal, true);
    return runLongRun(result.planPath, result.milestonePath ?? "(none)");
  }

  if (trimmed === "/verify") {
    const result = await runtime.verify();
    return runVerify(result.path);
  }

  if (trimmed === "/verify-json") {
    return JSON.stringify({ ...(await runtime.verify()), status: runtime.getStatus() }, null, 2);
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
        cwd: runtimeCwd,
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
          cwd: runtimeCwd,
          artifacts,
          target
        })),
        status: runtime.getStatus()
      },
      null,
      2
    );
  }

  if (trimmed === "/resume") {
    return runResume(await runtime.resume());
  }

  if (trimmed === "/resume-json") {
    return JSON.stringify({ phase: await runtime.resume(), status: runtime.getStatus() }, null, 2);
  }

  if (trimmed === "/reset") {
    return runReset() + `\n${await runtime.reset()}`;
  }

  if (trimmed === "/reset-json") {
    return JSON.stringify({ result: await runtime.reset(), status: runtime.getStatus() }, null, 2);
  }

  const normalized = trimmed.startsWith("/") ? trimmed : runAuto(trimmed);
  return runtime.handleInput(normalized);
}

export async function main(): Promise<void> {
  const { runtimeCwd, input } = parseCliInvocation(process.argv.slice(2));
  const runtime = await HarnessRuntime.create(runtimeCwd, "session-1", {
    substrateAdapter: createProcessPiSubstrateAdapter({
      cwd: runtimeCwd,
      sessionId: `cli:${process.pid}`,
      allowedTools: ["read", "write", "edit", "bash"]
    })
  });
  const output = await execute(runtime, input, runtimeCwd);
  const status = runtime.getStatus();
  const panelArtifacts = await runtime.listArtifacts();
  const panel = renderRuntimePanel({
      phase: status.phase,
      flow: status.flow,
      goalSummary: status.goalSummary,
      specPath: status.activeSpecPath,
      planPath: status.activePlanPath,
      milestone: status.activeMilestoneId,
      milestoneText: status.activeMilestoneText,
      milestoneStatus: status.activeMilestoneStatus,
      nextMilestone: status.nextMilestoneId,
      nextMilestoneText: status.nextMilestoneText,
      milestoneProgress: status.milestoneProgress,
      milestoneStatusCounts: status.milestoneStatusCounts,
      taskProgress: status.taskProgress,
      taskStatusCounts: status.taskStatusCounts,
      task: status.activeTaskId,
      taskText: status.activeTaskText,
      taskStatus: status.activeTaskStatus,
      taskKind: status.activeTaskKind,
      taskOwner: status.activeTaskOwner,
      expectedOutput: status.activeTaskExpectedOutput,
      taskOutputPath: status.activeTaskOutputPath,
      provider: status.activeProvider,
      modelId: status.activeModelId,
      modelTemperature: status.activeModelTemperature,
      modelMaxTokens: status.activeModelMaxTokens,
      executionMode: status.activeExecutionMode,
      verifyCommand: status.activeTaskVerifyCommand,
      recoveryHint: status.activeTaskRecoveryHint,
      verificationStatus: status.lastVerificationStatus,
      verification: status.lastVerificationPath,
      handoff: status.lastHandoffPath,
      blocker: status.blocker,
      readyTasks: status.readyTasks,
      pendingDependencies: status.pendingDependencies,
      allowedTools: status.allowedTools,
      recentArtifactSummary:
        panelArtifacts.length > 0
          ? [...panelArtifacts]
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
              .slice(0, 3)
              .map(item => `${item.type}: ${item.path}`)
              .join(" | ")
          : null,
      resumePhase: status.resumePhase,
      nextAction: status.nextAction
    });
  const shouldShowOnlyPanel = input === "/status" || input.trim() === "";
  const shouldHidePanel =
    input === "/help" ||
    input === "/doctor" ||
    input === "/bootstrap" ||
    input === "/status-json" ||
    input === "/status-dashboard" ||
    input === "/status-dashboard-json" ||
    input === "/doctor-json" ||
    input.startsWith("/bootstrap ") ||
    input.startsWith("/bootstrap-json") ||
    input === "/status-compact" ||
    input === "/status-compact-json" ||
    input === "/status compact" ||
    input === "/status compact --json" ||
    input === "/help-json" ||
    input === "/config-show" ||
    input === "/provider-check-json" ||
    input === "/provider-doctor-json" ||
    input.startsWith("/provider-smoke-json") ||
    input === "/web-smoke-json" ||
    input === "/web-verify-json" ||
    input === "/artifacts-json" ||
    input.startsWith("/artifacts-related-json") ||
    input === "/advance-json" ||
    input === "/blocked-json" ||
    input === "/continue-json" ||
    input === "/execute-json" ||
    input === "/pickup-json" ||
    input === "/queue-review-json" ||
    input.startsWith("/block-json") ||
    input === "/unblock-json" ||
    input === "/resume-json" ||
    input === "/reset-json" ||
    input.startsWith("/plan-json") ||
    input.startsWith("/longrun-json") ||
    input === "/verify-json" ||
    input.startsWith("/review-json") ||
    input === "/handoff-json" ||
    input.startsWith("/loop-json") ||
    input.startsWith("/find-json") ||
    input.startsWith("/grep-json") ||
    input.startsWith("/recent-json") ||
    input.startsWith("/artifacts-json") ||
    input === "/timeline-json";
  process.stdout.write(
    shouldShowOnlyPanel ? `${panel}\n` : shouldHidePanel ? `${output}\n` : `${output}\n\n${panel}\n`
  );
}

const executedPath = process.argv[1];
if (executedPath && fileURLToPath(import.meta.url) === executedPath) {
  void main();
}
