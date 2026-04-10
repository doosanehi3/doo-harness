import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanTasks } from "../packages/harness-runtime/src/context/plan-tasks.js";

test("parsePlanTasks extracts checkbox tasks in order", () => {
  const tasks = parsePlanTasks(`# Plan

- [ ] Clarify edge cases
- [x] Existing task already done
- [ ] Verify behavior independently`);

  assert.deepEqual(tasks, [
    { id: "T1", text: "Clarify edge cases", checked: false, milestoneId: undefined, kind: undefined, dependsOn: undefined, owner: undefined, expectedOutput: undefined, verifyCommands: undefined },
    { id: "T2", text: "Existing task already done", checked: true, milestoneId: undefined, kind: undefined, dependsOn: undefined, owner: undefined, expectedOutput: undefined, verifyCommands: undefined },
    { id: "T3", text: "Verify behavior independently", checked: false, milestoneId: undefined, kind: undefined, dependsOn: undefined, owner: undefined, expectedOutput: undefined, verifyCommands: undefined }
  ]);
});

test("parsePlanTasks extracts metadata fields", () => {
  const tasks = parsePlanTasks(`# Plan

- [ ] Implement the required change | kind=implementation | verify=pnpm run test`);

  assert.deepEqual(tasks, [
    {
      id: "T1",
      text: "Implement the required change",
      checked: false,
      milestoneId: undefined,
      kind: "implementation",
      dependsOn: undefined,
      owner: undefined,
      expectedOutput: undefined,
      verifyCommands: ["pnpm run test"]
    }
  ]);
});

test("parsePlanTasks extracts multiple verify commands split by double semicolon", () => {
  const tasks = parsePlanTasks(`# Plan

- [ ] Implement the required change | kind=implementation | verify=pnpm run test ;; pnpm run lint`);

  assert.deepEqual(tasks, [
    {
      id: "T1",
      text: "Implement the required change",
      checked: false,
      milestoneId: undefined,
      kind: "implementation",
      dependsOn: undefined,
      owner: undefined,
      expectedOutput: undefined,
      verifyCommands: ["pnpm run test", "pnpm run lint"]
    }
  ]);
});

test("parsePlanTasks extracts dependency metadata", () => {
  const tasks = parsePlanTasks(`# Plan

- [ ] Verify behavior independently | kind=verification | dependsOn=T2,T3 | verify=pnpm run test`);

  assert.deepEqual(tasks, [
    {
      id: "T1",
      text: "Verify behavior independently",
      checked: false,
      milestoneId: undefined,
      kind: "verification",
      dependsOn: ["T2", "T3"],
      owner: undefined,
      expectedOutput: undefined,
      verifyCommands: ["pnpm run test"]
    }
  ]);
});

test("parsePlanTasks extracts owner and expected output metadata", () => {
  const tasks = parsePlanTasks(`# Plan

- [ ] Implement the required change | kind=implementation | owner=worker | expectedOutput=code changes | verify=pnpm run test`);

  assert.deepEqual(tasks, [
    {
      id: "T1",
      text: "Implement the required change",
      checked: false,
      milestoneId: undefined,
      kind: "implementation",
      dependsOn: undefined,
      owner: "worker",
      expectedOutput: "code changes",
      verifyCommands: ["pnpm run test"]
    }
  ]);
});

test("parsePlanTasks extracts milestone metadata", () => {
  const tasks = parsePlanTasks(`# Plan

- [ ] Clarify edge cases | milestone=M1 | kind=analysis | verify=manual:review requirements`);

  assert.deepEqual(tasks, [
    {
      id: "T1",
      text: "Clarify edge cases",
      checked: false,
      milestoneId: "M1",
      kind: "analysis",
      dependsOn: undefined,
      owner: undefined,
      expectedOutput: undefined,
      verifyCommands: ["manual:review requirements"]
    }
  ]);
});
