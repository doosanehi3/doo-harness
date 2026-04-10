import type { VerificationResult } from "./types.js";

export function canComplete(result: VerificationResult | null): boolean {
  return result?.status === "pass";
}
