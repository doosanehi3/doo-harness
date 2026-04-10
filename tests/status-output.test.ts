import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStatusLine } from "../packages/cli/src/output.js";

test("formatStatusLine includes allowed tools", () => {
  const output = formatStatusLine({
    phase: "planning",
    flow: "milestone",
    goalSummary: "Implement RBAC",
    milestone: "M1",
    task: "T1",
    taskKind: "analysis",
    taskOwner: "planner",
    expectedOutput: "clarified requirements note",
    taskOutputPath: null,
    provider: "local",
    executionMode: "fresh",
    modelTemperature: 0.2,
    modelMaxTokens: 2000,
    verifyCommand: ["manual:review requirements"],
    recoveryHint: "manual_output_required",
    verification: null,
    handoff: null,
    blocker: null,
    readyTasks: ["T1 (analysis) Clarify edge cases owned by planner producing clarified requirements note"],
    pendingDependencies: ["T2 (implementation) Implement the required change owned by worker producing code changes waiting on T1"],
    allowedTools: ["read", "bash"],
    nextAction: "Use /continue."
  });

  assert.match(output, /Goal: Implement RBAC/);
  assert.match(output, /Provider: local/);
  assert.match(output, /Temperature: 0.2/);
  assert.match(output, /Max tokens: 2000/);
  assert.match(output, /Execution mode: fresh/);
  assert.match(output, /Recovery hint: manual_output_required/);
  assert.match(output, /Allowed tools: read, bash/);
});
