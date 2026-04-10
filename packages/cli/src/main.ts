import { HarnessRuntime, writeDefaultRuntimeConfig } from "../../harness-runtime/src/index.js";
import { fileURLToPath } from "node:url";
import { runArtifacts } from "./commands/handlers/artifacts.js";
import { runAdvance } from "./commands/handlers/advance.js";
import { runAuto } from "./commands/handlers/auto.js";
import { runBlock } from "./commands/handlers/block.js";
import { runContinue } from "./commands/handlers/continue.js";
import { runConfigInit, runConfigShow } from "./commands/handlers/config-init.js";
import { runExecute } from "./commands/handlers/execute.js";
import { runHandoff } from "./commands/handlers/handoff.js";
import { buildHelpPayload, runHelp } from "./commands/handlers/help.js";
import { runLongRun } from "./commands/handlers/longrun.js";
import { runLoop } from "./commands/handlers/loop.js";
import { runPlan } from "./commands/handlers/plan.js";
import { runProviderCheck } from "./commands/handlers/provider-check.js";
import { runProviderDoctor } from "./commands/handlers/provider-doctor.js";
import { runProviderSmoke } from "./commands/handlers/provider-smoke.js";
import { runReset } from "./commands/handlers/reset.js";
import { runReview } from "./commands/handlers/review.js";
import { runResume } from "./commands/handlers/resume.js";
import { runStatus } from "./commands/handlers/status.js";
import { runTaskDone } from "./commands/handlers/task-done.js";
import { runUnblock } from "./commands/handlers/unblock.js";
import { runVerify } from "./commands/handlers/verify.js";
import { renderRuntimePanel } from "../../tui/src/index.js";

async function execute(runtime: HarnessRuntime, rawInput: string): Promise<string> {
  const trimmed = rawInput.trim();
  const runtimeCwd = process.env.HARNESS_CWD_OVERRIDE ?? process.cwd();

  if (trimmed === "" || trimmed === "/status") {
    return runStatus(runtime.getStatus());
  }

  if (trimmed === "/help") {
    return runHelp();
  }

  if (trimmed === "/help-json") {
    return JSON.stringify(buildHelpPayload(), null, 2);
  }

  if (trimmed === "/status-json") {
    return JSON.stringify(runtime.getStatus(), null, 2);
  }

  if (trimmed === "/artifacts") {
    return runArtifacts(await runtime.listArtifacts());
  }

  if (trimmed === "/artifacts-json") {
    return JSON.stringify(await runtime.listArtifacts(), null, 2);
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

  if (trimmed === "/review") {
    return runReview(await runtime.review());
  }

  if (trimmed === "/review-json") {
    return JSON.stringify(
      {
        path: await runtime.review(),
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
  const args = process.argv.slice(2);
  const input = (args[0] === "--" ? args.slice(1) : args).join(" ").trim();
  const runtimeCwd = process.env.HARNESS_CWD_OVERRIDE ?? process.cwd();
  const runtime = await HarnessRuntime.create(runtimeCwd);
  const output = await execute(runtime, input);
  const status = runtime.getStatus();
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
      resumePhase: status.resumePhase,
      nextAction: status.nextAction
    });
  const shouldShowOnlyPanel = input === "/status" || input.trim() === "";
  const shouldHidePanel =
    input === "/help" ||
    input === "/status-json" ||
    input === "/help-json" ||
    input === "/config-show" ||
    input === "/provider-check-json" ||
    input === "/provider-doctor-json" ||
    input.startsWith("/provider-smoke-json") ||
    input === "/artifacts-json" ||
    input === "/advance-json" ||
    input === "/continue-json" ||
    input === "/execute-json" ||
    input.startsWith("/block-json") ||
    input === "/unblock-json" ||
    input === "/resume-json" ||
    input === "/reset-json" ||
    input.startsWith("/plan-json") ||
    input.startsWith("/longrun-json") ||
    input === "/verify-json" ||
    input === "/review-json" ||
    input === "/handoff-json" ||
    input.startsWith("/loop-json");
  process.stdout.write(
    shouldShowOnlyPanel ? `${panel}\n` : shouldHidePanel ? `${output}\n` : `${output}\n\n${panel}\n`
  );
}

const executedPath = process.argv[1];
if (executedPath && fileURLToPath(import.meta.url) === executedPath) {
  void main();
}
