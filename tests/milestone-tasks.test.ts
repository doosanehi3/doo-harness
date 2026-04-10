import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMilestones } from "../packages/harness-runtime/src/context/milestone-tasks.js";

test("parseMilestones extracts milestone ids and text", () => {
  const milestones = parseMilestones(`# Milestones

- M1: Scope and plan
- M2: Implement core slice
- M3: Verify and handoff`);

  assert.deepEqual(milestones, [
    { id: "M1", text: "Scope and plan", kind: undefined, dependsOn: undefined },
    { id: "M2", text: "Implement core slice", kind: undefined, dependsOn: undefined },
    { id: "M3", text: "Verify and handoff", kind: undefined, dependsOn: undefined }
  ]);
});

test("parseMilestones extracts metadata fields", () => {
  const milestones = parseMilestones(`# Milestones

- M2: Implement core slice | kind=implementation | dependsOn=M1`);

  assert.deepEqual(milestones, [
    {
      id: "M2",
      text: "Implement core slice",
      kind: "implementation",
      dependsOn: ["M1"]
    }
  ]);
});
