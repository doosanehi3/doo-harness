import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyWork } from "../packages/harness-runtime/src/router/classify-work.js";

test("classifies trivial work as trivial", () => {
  const result = classifyWork("로그인 버튼 에러만 고쳐줘");
  assert.equal(result.workClass, "trivial");
});

test("classifies regression-sensitive auth work as risky", () => {
  const result = classifyWork("인증 모듈 구조 정리하되 기존 동작 유지");
  assert.equal(result.workClass, "risky");
});

test("classifies broad redesign work as long_running", () => {
  const result = classifyWork("RBAC 시스템 재설계하고 관리자 UI/API/마이그레이션까지");
  assert.equal(result.workClass, "long_running");
});
