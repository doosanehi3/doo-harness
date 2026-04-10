import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessRuntime } from "../packages/harness-runtime/src/runtime/harness-runtime.js";
import { saveRunState } from "../packages/harness-runtime/src/state/run-state.js";
import { saveTaskState } from "../packages/harness-runtime/src/state/task-state.js";

async function createTempHarnessDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "doo-harness-"));
}

test("longrun planning persists milestone flow and active task", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("RBAC 시스템 재설계", true);
    const status = runtime.getStatus();

      assert.equal(status.phase, "planning");
	      assert.equal(status.flow, "milestone");
        assert.ok(status.activeSpecPath?.endsWith("/spec.md"));
	        assert.ok(status.activePlanPath?.endsWith("/plan.md"));
		        assert.equal(status.activeMilestoneId, "M1");
	        assert.equal(status.activeMilestoneText, "Scope and plan");
        assert.equal(status.activeMilestoneStatus, "in_progress");
	        assert.equal(status.nextMilestoneId, "M2");
        assert.equal(status.nextMilestoneText, "Implement core slice");
		    assert.equal(status.milestoneProgress, "0/3 done");
		    assert.equal(status.taskProgress, "0/3 done");
			        assert.equal(status.activeTaskId, "T1");
	        assert.equal(status.activeTaskText, "Clarify edge cases");
        assert.equal(status.activeTaskStatus, "todo");
	        assert.equal(status.activeTaskKind, "analysis");
	        assert.equal(status.activeTaskOwner, "planner");
	        assert.equal(status.activeTaskExpectedOutput, "clarified requirements note");
        assert.equal(status.activeProvider, "local");
	        assert.equal(status.activeModelId, "stub-planner");
        assert.equal(status.activeExecutionMode, "fresh");
	        assert.deepEqual(status.activeTaskVerifyCommand, ["manual:review requirements"]);
        const taskState = runtime.getTaskStateSnapshot();
        assert.equal(taskState.taskKinds.T2, "implementation");
      assert.equal(taskState.taskOwners.T2, "worker");
      assert.equal(taskState.taskExpectedOutputs.T2, "code changes");
      assert.equal(taskState.taskMilestones.T2, "M2");
      assert.equal(taskState.taskMilestones.T3, "M3");
      assert.deepEqual(taskState.taskDependencies.T2, ["T1"]);
      assert.deepEqual(taskState.taskDependencies.T3, ["T2"]);
      assert.deepEqual(taskState.taskVerificationCommands.T2, ["pnpm run test"]);
      assert.equal(taskState.milestoneKinds.M2, "implementation");
      assert.deepEqual(taskState.milestoneDependencies.M3, ["M2"]);
      assert.deepEqual(status.readyTasks, ["T1 (analysis) Clarify edge cases owned by planner producing clarified requirements note"]);
      assert.deepEqual(status.pendingDependencies, []);
      assert.match(status.nextAction, /Use \/continue to start T1 \(analysis\) Clarify edge cases owned by planner producing clarified requirements note/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

test("handoff then reset preserves handoff and clears active task", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Long-running task", true);
    const handoffPath = await runtime.createHandoff();
    const handoffBody = await readFile(handoffPath, "utf8");
    const resetMessage = await runtime.reset();
    const status = runtime.getStatus();

	    assert.match(handoffBody, /## Exact Next Step/);
    assert.match(handoffBody, /## Spec/);
    assert.match(handoffBody, /spec\.md/);
    assert.match(handoffBody, /## Plan/);
    assert.match(handoffBody, /plan\.md/);
	    assert.match(handoffBody, /## Task Text/);
	    assert.match(handoffBody, /Clarify edge cases/);
    assert.match(handoffBody, /## Task Status/);
    assert.match(handoffBody, /todo/);
			    assert.match(handoffBody, /## Task Kind/);
		    assert.match(handoffBody, /analysis/);
	    assert.match(handoffBody, /## Next Milestone/);
	    assert.match(handoffBody, /M2/);
	    assert.match(handoffBody, /## Active Milestone Text/);
	    assert.match(handoffBody, /Scope and plan/);
    assert.match(handoffBody, /## Active Milestone Status/);
    assert.match(handoffBody, /in_progress/);
	    assert.match(handoffBody, /## Next Milestone Text/);
    assert.match(handoffBody, /Implement core slice/);
    assert.match(handoffBody, /## Milestone Progress/);
    assert.match(handoffBody, /0\/3 done/);
    assert.match(handoffBody, /## Task Progress/);
    assert.match(handoffBody, /0\/3 done/);
    assert.match(handoffBody, /## Task Owner/);
    assert.match(handoffBody, /planner/);
	    assert.match(handoffBody, /## Expected Output/);
	    assert.match(handoffBody, /clarified requirements note/);
    assert.match(handoffBody, /## Provider/);
    assert.match(handoffBody, /local/);
	    assert.match(handoffBody, /## Model/);
    assert.match(handoffBody, /stub-planner/);
    assert.match(handoffBody, /## Execution Mode/);
    assert.match(handoffBody, /fresh/);
    assert.match(handoffBody, /## Verification Status/);
    assert.match(handoffBody, /\(none\)/);
    assert.match(handoffBody, /## Recovery Hint/);
    assert.match(handoffBody, /\(none\)/);
    assert.match(handoffBody, /## Ready Tasks/);
    assert.match(handoffBody, /T1 \(analysis\) Clarify edge cases owned by planner producing clarified requirements note/);
    assert.match(handoffBody, /## Pending Dependencies/);
    assert.match(handoffBody, /- \(none\)/);
    assert.match(handoffBody, /## Allowed Tools/);
    assert.match(handoffBody, /- read/);
    assert.match(handoffBody, /- bash/);
    assert.match(handoffBody, /Use \/continue to start T1 \(analysis\) Clarify edge cases owned by planner producing clarified requirements note\./);
    assert.match(resetMessage, /handoff preserved/);
    assert.equal(status.phase, "idle");
    assert.equal(status.activeTaskId, null);
    assert.equal(status.lastHandoffPath, handoffPath);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("create reconciles persisted run-state and task-state pointers", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Reconcile demo", true);
    const taskState = runtime.getTaskStateSnapshot();
    taskState.activeTaskId = "T3";
    taskState.activeMilestoneId = "M2";
    taskState.lastVerificationPath = "/tmp/verification.md";
    taskState.lastReviewPath = "/tmp/review.md";
    taskState.lastHandoffPath = "/tmp/handoff.md";
    taskState.taskBlockers.T3 = "persisted blocker";
    taskState.blockers = ["persisted blocker"];

    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);
    await saveRunState(join(cwd, ".harness", "state", "run-state.json"), {
      phase: "paused",
      currentFlow: "milestone",
      goalSummary: "Reconcile demo",
      activeSpecPath: "/tmp/spec.md",
      activePlanPath: "/tmp/plan.md",
      activeMilestoneId: "M1",
      activeTaskId: "T1",
      lastVerificationPath: null,
      lastReviewPath: null,
      lastHandoffPath: null,
      pendingQuestions: [],
      blocker: null,
      updatedAt: new Date().toISOString()
    });

    const refreshed = await HarnessRuntime.create(cwd);
    const status = refreshed.getStatus();
    const refreshedTaskState = refreshed.getTaskStateSnapshot();

    assert.equal(status.activeTaskId, "T3");
    assert.equal(status.activeMilestoneId, "M3");
    assert.equal(status.lastVerificationPath, "/tmp/verification.md");
    assert.equal(status.lastReviewPath, "/tmp/review.md");
    assert.equal(status.lastHandoffPath, "/tmp/handoff.md");
    assert.equal(status.blocker, null);
    assert.equal(status.activeTaskId, "T3");
    assert.equal(refreshedTaskState.taskBlockers.T3, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("starting a new plan clears stale blocker metadata from prior work", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Old blocked task", true);
    await runtime.executeCurrentTask();
    await runtime.blockCurrentTask("stale blocker");

    await runtime.plan("Fresh work after blocker", true);
    const status = runtime.getStatus();
    const taskState = runtime.getTaskStateSnapshot();

    assert.equal(status.blocker, null);
    assert.equal(taskState.taskBlockers.T1, undefined);
    assert.equal(taskState.taskRecoveryHints.T1, undefined);
    assert.deepEqual(taskState.blockers, []);
    assert.equal(taskState.activeTaskId, "T1");
    assert.equal(taskState.tasks.T1, "todo");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("advanceMilestone marks current done and activates next milestone", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("RBAC 시스템 재설계", true);
    const result = await runtime.advanceMilestone();
    const status = runtime.getStatus();

	    assert.match(result, /M1 completed; M2 is now active/);
	    assert.equal(status.phase, "planning");
	    assert.equal(status.flow, "milestone");
	    assert.equal(status.activeMilestoneId, "M2");
    assert.equal(status.activeMilestoneText, "Implement core slice");
	    assert.equal(status.nextMilestoneId, "M3");
    assert.equal(status.nextMilestoneText, "Verify and handoff");
    assert.equal(status.milestoneProgress, "1/3 done");
	    assert.equal(status.activeTaskId, "T2");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("advanceMilestone selects the first ready task belonging to the next milestone", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Milestone task mapping demo", true);
    const taskState = runtime.getTaskStateSnapshot();
    taskState.tasks.T2 = "done";
    taskState.tasks.T9 = "todo";
    taskState.taskMilestones.T9 = "M2";
    taskState.taskKinds.T9 = "implementation";
    taskState.taskOwners.T9 = "worker";
    taskState.taskExpectedOutputs.T9 = "alternate code changes";
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);

    const refreshed = await HarnessRuntime.create(cwd);
    const result = await refreshed.advanceMilestone();
    const status = refreshed.getStatus();

    assert.match(result, /M1 completed; M2 is now active/);
    assert.equal(status.activeMilestoneId, "M2");
    assert.equal(status.activeTaskId, "T9");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("risky request enters worker-validator planning flow and validator evidence reflects it", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.handleInput("인증 모듈 구조 정리하되 기존 동작 유지");

	    let status = runtime.getStatus();
	    assert.equal(status.phase, "planning");
	    assert.equal(status.flow, "worker_validator");
	    assert.equal(status.activeModelId, "stub-planner");

    await runtime.enterWorkerValidator("인증 모듈 구조 정리");
    const taskState = runtime.getTaskStateSnapshot();
    assert.equal(taskState.activeTaskId, "T1");
    assert.equal(taskState.tasks.T1, "in_progress");

	    const verification = await runtime.verify();
	    assert.equal(verification.result.status, "pass");
    assert.equal(verification.result.modelId, "stub-planner");
	    assert.match(verification.result.summary, /Validator independently reviewed/);
    assert.ok(verification.result.evidence.some(item => item.includes("model: stub-planner")));
	    assert.ok(verification.result.evidence.some(item => item.includes("Independent validator path selected")));
	    assert.ok(verification.result.evidence.some(item => item.includes("context: fresh in-process runtime")));

    status = runtime.getStatus();
    assert.equal(status.phase, "reviewing");
    assert.equal(status.flow, "worker_validator");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("auto long-running input uses rich planning runtime artifacts", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    const result = await runtime.handleInput("RBAC 시스템 재설계하고 관리자 UI/API/마이그레이션까지");
    const status = runtime.getStatus();
    const taskState = runtime.getTaskStateSnapshot();

    assert.match(result, /Flow: milestone/);
    assert.match(result, /Milestones:/);
    assert.equal(status.phase, "planning");
    assert.equal(status.flow, "milestone");
    assert.equal(status.activeTaskId, "T1");
    assert.equal(taskState.taskOwners.T2, "worker");
    assert.equal(taskState.taskExpectedOutputs.T3, "verification evidence");
    assert.deepEqual(taskState.taskDependencies.T3, ["T2"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("node cli longrun planning writes a concrete spec and plan for blank-repo goals", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan(
      "Build a dependency-free Node.js CLI called task-keeper that stores tasks in a local JSON file and supports add, list, done, remove, and stats commands with tests and a README.",
      true
    );

    const specBody = await readFile(join(cwd, ".harness", "artifacts", "spec.md"), "utf8");
    const planBody = await readFile(join(cwd, ".harness", "artifacts", "plan.md"), "utf8");
    const status = runtime.getStatus();
    const taskState = runtime.getTaskStateSnapshot();

    assert.match(specBody, /task-keeper/);
    assert.match(specBody, /task-keeper\.tasks\.json/);
    assert.match(specBody, /add, list, done, remove, and stats/);
    assert.match(planBody, /Define the CLI contract and persistence behavior/);
    assert.match(planBody, /Implement the CLI commands, JSON persistence, README, and tests/);
    assert.match(planBody, /Verify the CLI behavior independently/);
    assert.equal(status.activeTaskText, "Define the CLI contract and persistence behavior");
    assert.equal(taskState.taskExpectedOutputs.T1, "command contract note");
    assert.equal(taskState.taskExpectedOutputs.T2, "working CLI, README, and tests");
    assert.deepEqual(taskState.taskVerificationCommands.T2, ["pnpm run test"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("blockCurrentTask pauses the runtime and records blocker", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Blocking demo", true);
    await runtime.executeCurrentTask();
    const result = await runtime.blockCurrentTask("waiting on API schema");
    const status = runtime.getStatus();
    const taskState = runtime.getTaskStateSnapshot();

    assert.match(result, /blocked/);
    assert.equal(status.phase, "paused");
    assert.equal(status.blocker, "waiting on API schema");
    assert.equal(taskState.tasks.T1, "blocked");
    assert.equal(taskState.taskBlockers.T1, "waiting on API schema");
    assert.equal(taskState.resumePhase, "implementing");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("unblockCurrentTask clears blocker and lets continue resume execution", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Unblock demo", true);
    await runtime.executeCurrentTask();
    await runtime.blockCurrentTask("waiting on API schema");

    const unblock = await runtime.unblockCurrentTask();
    let status = runtime.getStatus();
    let taskState = runtime.getTaskStateSnapshot();

    assert.match(unblock, /moved back to todo/);
    assert.equal(status.phase, "paused");
    assert.equal(status.blocker, null);
    assert.equal(taskState.tasks.T1, "todo");

    const continued = await runtime.continueTaskLoop();
    status = runtime.getStatus();
    taskState = runtime.getTaskStateSnapshot();

    assert.match(continued, /moved to in_progress/);
    assert.equal(status.phase, "implementing");
    assert.equal(taskState.tasks.T1, "in_progress");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop resumes automatically when paused without blocker", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Resume demo", true);
    await runtime.executeCurrentTask();
    await runtime.blockCurrentTask("temporary blocker");
    await runtime.unblockCurrentTask();

    const result = await runtime.continueTaskLoop();
    const status = runtime.getStatus();

    assert.match(result, /Resumed into implementing/);
    assert.equal(status.phase, "implementing");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop advances todo task into execution", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Continue loop demo", true);
    const result = await runtime.continueTaskLoop();
    const status = runtime.getStatus();
    const taskState = runtime.getTaskStateSnapshot();

    assert.match(result, /moved to in_progress/);
    assert.equal(status.phase, "implementing");
    assert.equal(taskState.tasks.T1, "in_progress");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop reattaches to the first ready task when active task is missing", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Reattach ready task demo", true);
    const taskState = runtime.getTaskStateSnapshot();
    taskState.activeTaskId = null;
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);
    await saveRunState(join(cwd, ".harness", "state", "run-state.json"), {
      phase: "planning",
      currentFlow: "milestone",
      goalSummary: "Reattach ready task demo",
      activeSpecPath: join(cwd, ".harness", "artifacts", "spec.md"),
      activePlanPath: join(cwd, ".harness", "artifacts", "plan.md"),
      activeMilestoneId: "M1",
      activeTaskId: null,
      lastVerificationPath: null,
      lastReviewPath: null,
      lastHandoffPath: null,
      pendingQuestions: [],
      blocker: null,
      updatedAt: new Date().toISOString()
    });

    const refreshed = await HarnessRuntime.create(cwd);
    const result = await refreshed.continueTaskLoop();
    const status = refreshed.getStatus();

    assert.match(result, /T1 is now active/);
    assert.match(result, /T1 moved to in_progress/);
    assert.equal(status.activeTaskId, "T1");
    assert.equal(status.phase, "implementing");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("analysis task executes through planner fresh-context role", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Planner execution demo", true);
    const taskId = await runtime.executeCurrentTask();
    const status = runtime.getStatus();
    const taskState = runtime.getTaskStateSnapshot();

	    assert.equal(taskId, "T1");
	    assert.ok(taskState.taskOutputs.T1);
	    assert.equal(status.activeTaskOutputPath, taskState.taskOutputs.T1);
    assert.equal(status.activeProvider, "local");
	    assert.equal(status.activeModelId, "stub-planner");
    assert.equal(status.activeExecutionMode, "fresh");

    const note = await import("node:fs/promises").then(mod => mod.readFile(taskState.taskOutputs.T1, "utf8"));
    assert.match(note, /# Task Output/);
    assert.match(note, /Task: T1/);
    assert.match(note, /Role: planner/);
    assert.match(note, /Model: stub-planner/);
    assert.equal(status.activeExecutionMode, "fresh");
    assert.match(note, /Expected output: clarified requirements note/);
    assert.match(note, /## Summary/);
    assert.match(note, /Planner completed fresh-context analysis for T1 using stub-planner/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("analysis task can execute through subprocess planner mode when configured", async () => {
  const cwd = await createTempHarnessDir();
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          execution: {
            plannerMode: "subprocess"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Subprocess planner execution demo", true);
    const taskId = await runtime.executeCurrentTask();
    const taskState = runtime.getTaskStateSnapshot();
	    const note = await readFile(taskState.taskOutputs[taskId], "utf8");
	    const status = runtime.getStatus();

	    assert.equal(taskId, "T1");
    assert.equal(status.activeProvider, "local");
	    assert.equal(status.activeExecutionMode, "subprocess");
    assert.match(note, /Role: planner/);
    assert.match(note, /subprocess execution for T1 using stub-planner/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("implementation task can execute through fresh worker mode when configured", async () => {
  const cwd = await createTempHarnessDir();
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          execution: {
            workerMode: "fresh"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Fresh worker execution demo", true);
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
	    const taskState = runtime.getTaskStateSnapshot();
	    const note = await readFile(taskState.taskOutputs[taskId], "utf8");
    const status = runtime.getStatus();

	    assert.equal(taskId, "T2");
    assert.equal(status.activeProvider, "local");
	    assert.equal(status.activeExecutionMode, "fresh");
	    assert.match(note, /Role: worker/);
    assert.match(note, /Model: stub-worker/);
    assert.match(note, /Worker completed fresh-context execution for T2 using stub-worker/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("implementation task can execute through subprocess worker mode when configured", async () => {
  const cwd = await createTempHarnessDir();
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          execution: {
            workerMode: "subprocess"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Subprocess worker execution demo", true);
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
	    const taskState = runtime.getTaskStateSnapshot();
	    const note = await readFile(taskState.taskOutputs[taskId], "utf8");
    const status = runtime.getStatus();

	    assert.equal(taskId, "T2");
    assert.equal(status.activeProvider, "local");
	    assert.equal(status.activeExecutionMode, "subprocess");
    assert.match(note, /Role: worker/);
    assert.match(note, /Model: stub-worker/);
    assert.match(note, /subprocess execution for T2 using stub-worker/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("verify uses task verifyCommand for self-check flow", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Verify command demo", false);
    const taskStateSetup = runtime.getTaskStateSnapshot();
    taskStateSetup.taskVerificationCommands.T1 = ["this-command-should-fail"];
    await import("../packages/harness-runtime/src/state/task-state.js").then(mod =>
      mod.saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskStateSetup)
    );
    const refreshed = await HarnessRuntime.create(cwd);
    await refreshed.executeCurrentTask();
    const verification = await refreshed.verify();
    const status = refreshed.getStatus();
    const taskState = refreshed.getTaskStateSnapshot();
    const verificationBody = status.lastVerificationPath
      ? await readFile(status.lastVerificationPath, "utf8")
      : "";

    assert.equal(verification.result.status, "fail");
    assert.equal(verification.result.provider, "local");
    assert.equal(verification.result.modelId, "stub-planner");
    assert.equal(verification.result.expectedOutput, "clarified requirements note");
    assert.equal(verification.result.taskOutputPath, taskState.taskOutputs.T1);
    assert.match(verification.result.summary, /Verification commands failed/);
    assert.ok(verification.result.failedChecks?.length);
      assert.ok(
        verification.result.checks?.some(
        check => check.kind === "command" && check.label === "verify-command-1"
      )
    );
    assert.match(verificationBody, /Model: stub-planner/);
    assert.match(verificationBody, /Provider: local/);
    assert.equal(verification.result.recoveryHint, null);
    assert.equal(status.phase, "paused");
    assert.ok(status.blocker);
    assert.equal(taskState.tasks.T1, "blocked");
    assert.ok(taskState.taskBlockers.T1);
    assert.equal(taskState.taskRecoveryHints.T1, undefined);
    assert.match(status.nextAction, /use \/unblock and rerun/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop can move validated milestone work into review pause and then advance", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Continue milestone demo", true);
    const taskStateSetup = runtime.getTaskStateSnapshot();
      taskStateSetup.taskVerificationCommands.T1 = ["printf verified"];
    await import("../packages/harness-runtime/src/state/task-state.js").then(mod =>
      mod.saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskStateSetup)
    );
    const refreshed = await HarnessRuntime.create(cwd);
    await refreshed.executeCurrentTask();
    await refreshed.verify();

    const reviewResult = await refreshed.continueTaskLoop();
    let status = refreshed.getStatus();
    let taskState = refreshed.getTaskStateSnapshot();
    const reviewBody = status.lastReviewPath ? await readFile(status.lastReviewPath, "utf8") : "";

    assert.match(reviewResult, /review ->/);
    assert.equal(status.phase, "paused");
    assert.equal(taskState.tasks.T1, "done");
		    assert.equal(taskState.resumePhase, "planning");
		    assert.match(status.nextAction, /advance from M1 to M2/);
		    assert.match(reviewBody, /Task text: Clarify edge cases/);
    assert.match(reviewBody, /Task status: done/);
		    assert.match(reviewBody, /Task kind: analysis/);
    assert.match(reviewBody, /Milestone status: done/);
    assert.match(reviewBody, /Milestone status counts: todo=2 done=1/);
    assert.match(reviewBody, /Task status counts: todo=2 done=1/);
    assert.match(reviewBody, /Spec: .*spec\.md/);
    assert.match(reviewBody, /Plan: .*plan\.md/);
	    assert.match(reviewBody, /Task owner: planner/);
    assert.match(reviewBody, /Expected output: clarified requirements note/);
    assert.match(reviewBody, /Model: stub-planner/);
    assert.match(reviewBody, /Verification status: pass/);
    assert.match(reviewBody, /Recovery hint: \(none\)/);
    assert.match(reviewBody, /Ready tasks:/);
    assert.match(reviewBody, /Ready tasks: \(none\)/);
    assert.match(reviewBody, /Pending dependencies:/);
    assert.match(reviewBody, /Allowed tools: read, bash/);
    assert.match(reviewBody, /Next action: Use \/continue to advance from M1 to M2\./);

	    const advanceResult = await refreshed.continueTaskLoop();
	    status = refreshed.getStatus();
	    taskState = refreshed.getTaskStateSnapshot();

	    assert.match(advanceResult, /M1 completed; M2 is now active/);
	    assert.match(advanceResult, /T2 moved to in_progress/);
		    assert.equal(status.phase, "implementing");
		    assert.equal(status.activeMilestoneId, "M2");
        assert.equal(status.activeMilestoneStatus, "in_progress");
		    assert.equal(taskState.activeTaskId, "T2");
        assert.equal(status.activeTaskStatus, "in_progress");
		    assert.equal(taskState.tasks.T2, "in_progress");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status nextAction includes details for the next ready task after a completed task", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Next action detail demo", true);
    await runtime.completeCurrentTask();
    const status = runtime.getStatus();

    assert.match(status.nextAction, /advance from M1 to M2/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("default analysis task can pass via manual verification and move into review", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Manual verification happy path", true);
    await runtime.executeCurrentTask();

    const verification = await runtime.verify();
    const status = runtime.getStatus();
    const taskState = runtime.getTaskStateSnapshot();
    const verificationBody = status.lastVerificationPath
      ? await readFile(status.lastVerificationPath, "utf8")
      : "";

    assert.equal(verification.result.status, "pass");
    assert.equal(verification.result.provider, "local");
    assert.equal(verification.result.modelId, "stub-planner");
    assert.equal(verification.result.recoveryHint, null);
    assert.ok(
      verification.result.checks?.some(
        check => check.kind === "manual" && check.label === "verify-command-1"
      )
    );
    assert.match(verificationBody, /Model: stub-planner/);
    assert.match(verificationBody, /Provider: local/);
    assert.match(verificationBody, /Expected Output: clarified requirements note/);
    assert.match(verificationBody, /Task Output:/);
    assert.equal(status.phase, "reviewing");
    assert.equal(taskState.tasks.T1, "validated");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop auto-recovers manual verification blockers by generating task output", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Manual verification recovery", true);

    const verification = await runtime.verify();
    let status = runtime.getStatus();
    let taskState = runtime.getTaskStateSnapshot();
    const verificationBody = status.lastVerificationPath
      ? await readFile(status.lastVerificationPath, "utf8")
      : "";

    assert.equal(verification.result.status, "fail");
    assert.equal(verification.result.recoveryHint, "manual_output_required");
    assert.equal(status.phase, "paused");
    assert.equal(taskState.tasks.T1, "blocked");
    assert.equal(taskState.taskOutputs.T1, undefined);
    assert.equal(taskState.taskRecoveryHints.T1, "manual_output_required");
    assert.match(verificationBody, /Recovery Hint: manual_output_required/);
    assert.match(status.nextAction, /Use \/continue to generate the missing task output/i);

    const continued = await runtime.continueTaskLoop();
    status = runtime.getStatus();
    taskState = runtime.getTaskStateSnapshot();

    assert.match(continued, /re-queued because manual verification needed task output/i);
    assert.match(continued, /moved to in_progress/);
    assert.equal(status.phase, "implementing");
    assert.equal(status.blocker, null);
    assert.equal(taskState.tasks.T1, "in_progress");
    assert.ok(taskState.taskOutputs.T1);
    assert.equal(taskState.taskBlockers.T1, undefined);
    assert.equal(taskState.taskRecoveryHints.T1, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop does not execute a task whose dependencies are not done", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Dependency-aware continue", true);
    const taskStateSetup = runtime.getTaskStateSnapshot();
    taskStateSetup.activeTaskId = "T3";
    taskStateSetup.tasks.T1 = "done";
    taskStateSetup.tasks.T2 = "todo";
    taskStateSetup.tasks.T3 = "todo";
    await import("../packages/harness-runtime/src/state/task-state.js").then(mod =>
      mod.saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskStateSetup)
    );

    const refreshed = await HarnessRuntime.create(cwd);
    const result = await refreshed.continueTaskLoop();
    const status = refreshed.getStatus();
    const taskState = refreshed.getTaskStateSnapshot();

    assert.match(result, /waiting on dependencies: T2/);
    assert.equal(status.phase, "paused");
    assert.equal(taskState.tasks.T3, "todo");
    assert.match(status.nextAction, /waiting on dependencies: T2/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop sends verification-kind todo task directly into verification", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Verification task continue", true);
    const taskStateSetup = runtime.getTaskStateSnapshot();
    taskStateSetup.activeTaskId = "T3";
    taskStateSetup.tasks.T1 = "done";
    taskStateSetup.tasks.T2 = "done";
    taskStateSetup.tasks.T3 = "todo";
    taskStateSetup.taskVerificationCommands.T3 = ["printf verified"];
    await import("../packages/harness-runtime/src/state/task-state.js").then(mod =>
      mod.saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskStateSetup)
    );

    const refreshed = await HarnessRuntime.create(cwd);
    const result = await refreshed.continueTaskLoop();
    const status = refreshed.getStatus();
    const taskState = refreshed.getTaskStateSnapshot();
    const verificationPath = status.lastVerificationPath;
    const verificationBody = verificationPath
      ? await import("node:fs/promises").then(mod => mod.readFile(verificationPath, "utf8"))
      : "";

    assert.match(result, /verification task -> pass/);
    assert.equal(status.phase, "reviewing");
    assert.equal(taskState.tasks.T3, "validated");
    assert.match(verificationBody, /Mode: independent_validate/);
    assert.match(verificationBody, /Independent validator path selected/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("verification task can use validator agent mode when configured", async () => {
  const cwd = await createTempHarnessDir();
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          execution: {
            validatorMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Validator agent execution demo", true);
    const taskStateSetup = runtime.getTaskStateSnapshot();
    taskStateSetup.activeTaskId = "T3";
    taskStateSetup.tasks.T1 = "done";
    taskStateSetup.tasks.T2 = "done";
    taskStateSetup.tasks.T3 = "todo";
    taskStateSetup.taskVerificationCommands.T3 = ["printf verified"];
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskStateSetup);

    const refreshed = await HarnessRuntime.create(cwd);
    const result = await refreshed.continueTaskLoop();
    const status = refreshed.getStatus();
    const verificationBody = status.lastVerificationPath
      ? await readFile(status.lastVerificationPath, "utf8")
      : "";

    assert.match(result, /verification task -> pass/);
    assert.equal(status.activeExecutionMode, "agent");
    assert.match(verificationBody, /Mode: independent_validate/);
    assert.match(verificationBody, /validation path: agent/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runCompletionLoop can drive a configured long-running plan to completion", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Completion loop demo", true);
    const taskState = runtime.getTaskStateSnapshot();
    taskState.taskVerificationCommands.T2 = ["printf verified"];
    taskState.taskVerificationCommands.T3 = ["printf verified"];
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);

    const refreshed = await HarnessRuntime.create(cwd);
    const result = await refreshed.runCompletionLoopDetailed(10);
    const status = refreshed.getStatus();

    assert.ok(result.steps.length > 0);
    assert.equal(result.stopReason, "completed");
    assert.equal(result.finalPhase, "completed");
    assert.equal(result.finalMilestoneId, "M3");
    assert.equal(result.finalTaskId, "T3");
    assert.equal(result.completed, true);
    assert.equal(status.phase, "completed");
    assert.equal(status.activeMilestoneId, "M3");
    assert.equal(status.milestoneProgress, "3/3 done");
    assert.equal(status.taskProgress, "3/3 done");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop auto-recovers implementation verification failures back into execution", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Implementation fix recovery demo", true);
    await runtime.advanceMilestone();
    const taskStateBefore = runtime.getTaskStateSnapshot();
    taskStateBefore.taskVerificationCommands.T2 = ["node -e \"process.exit(1)\""];
    taskStateBefore.taskDependencies.T2 = [];
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskStateBefore);
    const refreshed = await HarnessRuntime.create(cwd);
    await refreshed.executeCurrentTask();

    const verification = await refreshed.verify();
    let status = refreshed.getStatus();
    let taskState = refreshed.getTaskStateSnapshot();

    assert.equal(verification.result.status, "fail");
    assert.equal(status.phase, "paused");
    assert.equal(taskState.tasks.T2, "blocked");
    assert.equal(taskState.taskRecoveryHints.T2, "implementation_fix_required");

    const continued = await refreshed.continueTaskLoop();
    status = refreshed.getStatus();
    taskState = refreshed.getTaskStateSnapshot();

    assert.match(continued, /implementation verification failed/i);
    assert.equal(status.phase, "implementing");
    assert.equal(taskState.tasks.T2, "in_progress");
    assert.equal(taskState.taskRecoveryHints.T2, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continueTaskLoop auto-recovers legacy implementation verification failures without a recovery hint", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Legacy implementation fix recovery demo", true);
    await runtime.advanceMilestone();
    const taskStateBefore = runtime.getTaskStateSnapshot();
    taskStateBefore.taskVerificationCommands.T2 = ["node -e \"process.exit(1)\""];
    taskStateBefore.taskDependencies.T2 = [];
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskStateBefore);
    const refreshed = await HarnessRuntime.create(cwd);
    await refreshed.executeCurrentTask();
    await refreshed.verify();

    const blockedState = refreshed.getTaskStateSnapshot();
    delete blockedState.taskRecoveryHints.T2;
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), blockedState);
    const legacy = await HarnessRuntime.create(cwd);

    const continued = await legacy.continueTaskLoop();
    const status = legacy.getStatus();
    const taskState = legacy.getTaskStateSnapshot();

    assert.match(continued, /implementation verification failed/i);
    assert.equal(status.phase, "implementing");
    assert.equal(taskState.tasks.T2, "in_progress");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runCompletionLoop auto-recovers manual verification blockers instead of stopping blocked", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Loop recovery demo", true);

    const firstVerify = await runtime.verify();
    assert.equal(firstVerify.result.status, "fail");

    const loop = await runtime.runCompletionLoopDetailed(2);
    const status = runtime.getStatus();
    const taskState = runtime.getTaskStateSnapshot();

    assert.equal(loop.stopReason, "max_steps");
    assert.match(loop.steps[0] ?? "", /re-queued because manual verification needed task output/i);
    assert.match(loop.steps[1] ?? "", /verification -> pass/i);
    assert.equal(status.phase, "reviewing");
    assert.equal(taskState.tasks.T1, "validated");
    assert.equal(status.blocker, null);
    assert.equal(taskState.taskRecoveryHints.T1, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
