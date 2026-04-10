import { test } from "node:test";
import assert from "node:assert/strict";
import { getAllowedToolNamesForPhase } from "../packages/harness-runtime/src/policy/tool-policy.js";

test("planning phase is read-only", () => {
  assert.deepEqual(
    getAllowedToolNamesForPhase({
      phase: "planning",
      flow: "disciplined_single",
      activeTaskId: "T1",
      activeTaskKind: "analysis",
      activeTaskStatus: "todo",
      activeTaskBlocker: null,
      blocker: null
    }),
    ["read", "bash"]
  );
});

test("implementing phase allows file mutation tools", () => {
  assert.deepEqual(
    getAllowedToolNamesForPhase({
      phase: "implementing",
      flow: "milestone",
      activeTaskId: "T1",
      activeTaskKind: "implementation",
      activeTaskStatus: "in_progress",
      activeTaskBlocker: null,
      blocker: null
    }),
    ["read", "write", "edit", "bash"]
  );
});

test("verifying phase stays read-only", () => {
  assert.deepEqual(
    getAllowedToolNamesForPhase({
      phase: "verifying",
      flow: "worker_validator",
      activeTaskId: "T1",
      activeTaskKind: "verification",
      activeTaskStatus: "validated",
      activeTaskBlocker: null,
      blocker: null
    }),
    ["read", "bash"]
  );
});

test("blocked task forces read-only tools even in paused state", () => {
  assert.deepEqual(
    getAllowedToolNamesForPhase({
      phase: "paused",
      flow: "milestone",
      activeTaskId: "T1",
      activeTaskKind: "implementation",
      activeTaskStatus: "blocked",
      activeTaskBlocker: "waiting on API schema",
      blocker: "waiting on API schema"
    }),
    ["read", "bash"]
  );
});

test("validated task remains read-only even if phase says implementing", () => {
  assert.deepEqual(
    getAllowedToolNamesForPhase({
      phase: "implementing",
      flow: "disciplined_single",
      activeTaskId: "T1",
      activeTaskKind: "implementation",
      activeTaskStatus: "validated",
      activeTaskBlocker: null,
      blocker: null
    }),
    ["read", "bash"]
  );
});

test("analysis task remains read-only even in implementing phase", () => {
  assert.deepEqual(
    getAllowedToolNamesForPhase({
      phase: "implementing",
      flow: "milestone",
      activeTaskId: "T1",
      activeTaskKind: "analysis",
      activeTaskStatus: "in_progress",
      activeTaskBlocker: null,
      blocker: null
    }),
    ["read", "bash"]
  );
});

test("verification task remains read-only even in implementing phase", () => {
  assert.deepEqual(
    getAllowedToolNamesForPhase({
      phase: "implementing",
      flow: "milestone",
      activeTaskId: "T1",
      activeTaskKind: "verification",
      activeTaskStatus: "in_progress",
      activeTaskBlocker: null,
      blocker: null
    }),
    ["read", "bash"]
  );
});
