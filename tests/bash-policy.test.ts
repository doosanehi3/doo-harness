import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBashCommandForPhase } from "../packages/harness-runtime/src/policy/bash-policy.js";

test("read-only phase allows read-only commands", () => {
  assert.doesNotThrow(() => validateBashCommandForPhase("planning", "rg TODO src"));
});

test("read-only phase blocks mutating commands", () => {
  assert.throws(() => validateBashCommandForPhase("planning", "rm -rf tmp"));
});

test("implementing phase allows mutating commands", () => {
  assert.doesNotThrow(() => validateBashCommandForPhase("implementing", "mkdir build"));
});
