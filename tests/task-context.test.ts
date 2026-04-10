import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPrompt } from "../packages/harness-runtime/src/context/task-context.js";

test("buildExecutionPrompt includes goal, plan, milestone, and task focus", () => {
  const prompt = buildExecutionPrompt({
    goalSummary: "Implement RBAC",
    activePlanPath: "/tmp/plan.md",
    activePlanExcerpt: "- [ ] Add RBAC middleware",
    activeSpecExcerpt: "Goal: support role-based access",
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
  assert.match(prompt, /Focus only on T2/);
  assert.match(prompt, /Existing scaffold files you should modify/);
  assert.match(prompt, /package\.json/);
  assert.match(prompt, /Do not only describe intended work/);
  assert.match(prompt, /create any missing bootstrap files needed for verification/);
  assert.match(prompt, /verification command can succeed/);
});
