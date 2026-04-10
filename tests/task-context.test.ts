import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPrompt, buildNoChangeRecoveryPrompt } from "../packages/harness-runtime/src/context/task-context.js";

test("buildExecutionPrompt includes goal, plan, milestone, and task focus", () => {
  const prompt = buildExecutionPrompt({
    goalSummary: "Implement RBAC",
    activePlanPath: "/tmp/plan.md",
    activePlanExcerpt: "- [ ] Add RBAC middleware",
    activeSpecExcerpt: "Goal: support role-based access",
    lastVerificationExcerpt: "Verification commands failed because tests still expect placeholder behavior.",
    lastTaskOutputExcerpt: "# Task Output\nChanged Files:\n- src/app-cli.js",
    activeMilestoneId: "M2",
    activeTaskId: "T2",
    taskKind: "implementation",
    taskOwner: "worker",
    expectedOutput: "code changes",
    taskStatus: "in_progress",
    blocker: "Implementation produced no concrete file changes outside .harness.",
    scaffoldFiles: ["package.json", "src/app-cli.js", "tests/app-cli.test.js"]
  });

  assert.match(prompt, /Goal: Implement RBAC/);
  assert.match(prompt, /Plan: \/tmp\/plan\.md/);
  assert.match(prompt, /Milestone: M2/);
  assert.match(prompt, /Task: T2/);
  assert.match(prompt, /Task kind: implementation/);
  assert.match(prompt, /Task owner: worker/);
  assert.match(prompt, /Expected output: code changes/);
  assert.match(prompt, /Current blocker: Implementation produced no concrete file changes outside \.harness\./);
  assert.match(prompt, /Spec excerpt:/);
  assert.match(prompt, /Plan excerpt:/);
  assert.match(prompt, /Last verification excerpt:/);
  assert.match(prompt, /tests still expect placeholder behavior/);
  assert.match(prompt, /Previous task output excerpt:/);
  assert.match(prompt, /Changed Files:/);
  assert.match(prompt, /Focus only on T2/);
  assert.match(prompt, /Existing scaffold files you should modify/);
  assert.match(prompt, /package\.json/);
  assert.match(prompt, /Do not only describe intended work/);
  assert.match(prompt, /create any missing bootstrap files needed for verification/);
  assert.match(prompt, /verification command can succeed/);
});

test("buildNoChangeRecoveryPrompt includes failure context and concrete retry instructions", () => {
  const prompt = buildNoChangeRecoveryPrompt({
    goalSummary: "Build task keeper CLI",
    activePlanPath: "/tmp/plan.md",
    activePlanExcerpt: "- [ ] Implement CLI commands and tests",
    activeSpecExcerpt: "Persist tasks in task-keeper.tasks.json",
    lastVerificationExcerpt: "✖ task-keeper add command\nAssertionError: Implement add command",
    lastTaskOutputExcerpt: "# Task Output\n## Changed Files\n- src/task-keeper.js",
    activeMilestoneId: "M2",
    activeTaskId: "T2",
    taskKind: "implementation",
    expectedOutput: "working CLI, README, and tests",
    taskStatus: "blocked",
    blocker: "Implementation produced no concrete file changes outside .harness.",
    scaffoldFiles: ["README.md", "src/task-keeper.js", "tests/task-keeper.test.js"]
  });

  assert.match(prompt, /previous implementation turn finished without making any concrete file changes/i);
  assert.match(prompt, /Last verification excerpt:/);
  assert.match(prompt, /Implement add command/);
  assert.match(prompt, /Previous task output excerpt:/);
  assert.match(prompt, /Changed Files/);
  assert.match(prompt, /Replace placeholder failing tests such as assert\.fail/);
  assert.match(prompt, /Modify at least one of these existing scaffold files:/);
  assert.match(prompt, /Do not answer with only a summary/);
});
