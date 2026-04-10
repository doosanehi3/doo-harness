import type { ClassificationResult, WorkClass } from "./types.js";

const AMBIGUITY_PATTERNS = [
  /\b정리\b/,
  /\b개선\b/,
  /\b리팩토링\b/,
  /\b구조\b/,
  /\b재구성\b/,
  /\b좋게\b/,
  /\b깔끔/i,
  /\b전체적/i,
  /\b좀 더\b/,
  /\bimprove\b/i,
  /\brefactor\b/i,
  /\bclean up\b/i,
  /\boverall\b/i
];

const RISK_PATTERNS = [
  /\bauth\b/i,
  /\b인증\b/,
  /\bpermission\b/i,
  /\b권한\b/,
  /\brbac\b/i,
  /\bpayment\b/i,
  /\bmigration\b/i,
  /\bsession\b/i,
  /\bstate\b/i,
  /\bcache\b/i,
  /\binfra\b/i,
  /\bsecurity\b/i,
  /\b기존 동작\b/,
  /\b회귀\b/,
  /\brewrite\b/i
];

const LONG_RUNNING_PATTERNS = [
  /\bplatform\b/i,
  /\bsystem\b/i,
  /\b체계\b/,
  /\bre-?design\b/i,
  /\bredesign\b/i,
  /\bmultiple\b/i,
  /\bmilestone\b/i,
  /\blong[- ]running\b/i,
  /\b대규모\b/,
  /\b장기\b/,
  /\b재설계\b/
];

const MULTI_SURFACE_PATTERNS = [
  /\bapi\b/i,
  /\bui\b/i,
  /\bdb\b/i,
  /\bdatabase\b/i,
  /\bmigration\b/i,
  /\badmin\b/i,
  /\bbackend\b/i,
  /\bfrontend\b/i
];

function countMatches(input: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(input) ? 1 : 0), 0);
}

export function classifyWork(input: string): ClassificationResult {
  const normalized = input.trim();
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  const ambiguity = Math.min(
    3,
    countMatches(normalized, AMBIGUITY_PATTERNS) +
      (normalized.length === 0 ? 1 : 0) +
      (/뭔가|좀|좋게|정리/i.test(normalized) ? 1 : 0)
  );
  const risk = Math.min(
    3,
    countMatches(normalized, RISK_PATTERNS) +
      (/\bexisting behavior|기존 동작|호환|regression|keep .* working\b/i.test(normalized) ? 1 : 0) +
      (/모듈|구조|refactor|rewrite/i.test(normalized) ? 1 : 0)
  );
  const scope = Math.min(
    3,
    countMatches(normalized, MULTI_SURFACE_PATTERNS) +
      ((/\band\b/i.test(normalized) || /와|과|및/.test(normalized)) ? 1 : 0) +
      (tokenCount > 10 ? 1 : 0)
  );
  const duration = Math.min(
    3,
    countMatches(normalized, LONG_RUNNING_PATTERNS) +
      (scope >= 2 ? 1 : 0) +
      (/재설계|시스템|체계|workflow|milestone/i.test(normalized) ? 1 : 0)
  );

  const ambiguous = ambiguity >= 2;
  const risky = risk >= 2;
  const longRunning = duration >= 2 || scope >= 3;

  let workClass: WorkClass;
  if (longRunning) {
    workClass = "long_running";
  } else if (risky) {
    workClass = "risky";
  } else if (scope >= 1 || ambiguous) {
    workClass = "standard";
  } else {
    workClass = "trivial";
  }

  const reasons: string[] = [];
  if (ambiguous) reasons.push("request needs clarification");
  if (scope >= 1) reasons.push("request is broader than a trivial fix");
  if (risky) reasons.push("request touches regression-sensitive areas");
  if (longRunning) reasons.push("request likely requires milestones and handoff");
  if (reasons.length === 0) reasons.push("request appears small and well-scoped");

  return {
    workClass,
    ambiguous,
    risky,
    longRunning,
    reasons
  };
}
