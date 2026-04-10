import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStatusLine } from "../packages/cli/src/output.js";

test("formatStatusLine humanizes manual verify commands", () => {
  const output = formatStatusLine({
    phase: "planning",
    flow: "milestone",
    milestone: "M1",
    task: "T1",
    taskKind: "analysis",
    taskOwner: "planner",
    expectedOutput: "clarified requirements note",
    verifyCommand: ["manual:review requirements", "pnpm run test"],
    verification: null,
    handoff: null,
    blocker: null,
    nextAction: "Use /continue."
  });

  assert.match(output, /Verify cmd: manual review \(review requirements\) ;; pnpm run test/);
});
