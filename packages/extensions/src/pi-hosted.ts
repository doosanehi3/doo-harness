import { createPiSubstrateAdapter, type PiSubstrateAdapter } from "../../ai/src/index.js";
import { HarnessRuntime } from "../../harness-runtime/src/index.js";
import { runArtifacts } from "../../cli/src/commands/handlers/artifacts.js";
import { runContinue } from "../../cli/src/commands/handlers/continue.js";
import { buildHelpPayload, runHelp } from "../../cli/src/commands/handlers/help.js";
import { runHandoff } from "../../cli/src/commands/handlers/handoff.js";
import { runLongRun } from "../../cli/src/commands/handlers/longrun.js";
import { runPlan } from "../../cli/src/commands/handlers/plan.js";
import { runReset } from "../../cli/src/commands/handlers/reset.js";
import { runResume } from "../../cli/src/commands/handlers/resume.js";
import { runReview } from "../../cli/src/commands/handlers/review.js";
import { runStatus } from "../../cli/src/commands/handlers/status.js";
import { runVerify } from "../../cli/src/commands/handlers/verify.js";

export interface PiHostedHarnessHost {
  cwd: string;
  sessionId?: string | null;
  allowedTools?: string[];
}

export interface PiHostedHarnessBridge {
  execute(input: string): Promise<string>;
  getRuntime(): Promise<HarnessRuntime>;
}

function normalizeHostedInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/status";
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const [command, ...rest] = parts;
  const json = rest.includes("--json");
  const payload = rest.filter(token => token !== "--json");
  const join = (base: string, args: string[] = []) => [base, ...args].join(" ").trim();

  switch (command) {
    case "help":
      return json ? "/help-json" : "/help";
    case "status":
      return json ? "/status-json" : "/status";
    case "artifacts":
      return json ? "/artifacts-json" : "/artifacts";
    case "plan":
      return json ? join("/plan-json", payload) : join("/plan", payload);
    case "longrun":
      return json ? join("/longrun-json", payload) : join("/longrun", payload);
    case "continue":
      return json ? "/continue-json" : "/continue";
    case "verify":
      return json ? "/verify-json" : "/verify";
    case "review":
      return json ? "/review-json" : "/review";
    case "handoff":
      return json ? "/handoff-json" : "/handoff";
    case "resume":
      return json ? "/resume-json" : "/resume";
    case "reset":
      return json ? "/reset-json" : "/reset";
    default:
      return trimmed;
  }
}

function createHostedAdapter(host: PiHostedHarnessHost): PiSubstrateAdapter {
  return createPiSubstrateAdapter({
    session: {
      cwd: host.cwd,
      sessionId: host.sessionId ?? null
    },
    tools: {
      getAllowedTools: () => host.allowedTools ?? ["read", "write", "edit", "bash"]
    }
  });
}

async function executeHostedCommand(runtime: HarnessRuntime, input: string): Promise<string> {
  const trimmed = normalizeHostedInput(input);

  if (trimmed === "/help") {
    return runHelp();
  }
  if (trimmed === "/help-json") {
    return JSON.stringify(buildHelpPayload(), null, 2);
  }
  if (trimmed === "/status") {
    return runStatus(runtime.getStatus());
  }
  if (trimmed === "/status-json") {
    return JSON.stringify(runtime.getStatus(), null, 2);
  }
  if (trimmed === "/artifacts") {
    return runArtifacts(await runtime.listArtifacts());
  }
  if (trimmed === "/artifacts-json") {
    return JSON.stringify(await runtime.listArtifacts(), null, 2);
  }
  if (trimmed.startsWith("/plan-json")) {
    const goal = trimmed.replace(/^\/plan-json\s*/, "").trim();
    const result = await runtime.plan(goal || "(empty goal)", false);
    return JSON.stringify({ ...result, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed.startsWith("/plan")) {
    const goal = trimmed.replace(/^\/plan\s*/, "").trim();
    const result = await runtime.plan(goal || "(empty goal)", false);
    return runPlan(result.planPath);
  }
  if (trimmed.startsWith("/longrun-json")) {
    const goal = trimmed.replace(/^\/longrun-json\s*/, "").trim();
    const result = await runtime.plan(goal || "(empty goal)", true);
    return JSON.stringify({ ...result, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed.startsWith("/longrun")) {
    const goal = trimmed.replace(/^\/longrun\s*/, "").trim();
    const result = await runtime.plan(goal || "(empty goal)", true);
    return runLongRun(result.planPath, result.milestonePath ?? "(none)");
  }
  if (trimmed === "/continue") {
    return runContinue(await runtime.continueTaskLoop());
  }
  if (trimmed === "/continue-json") {
    return JSON.stringify({ result: await runtime.continueTaskLoop(), status: runtime.getStatus() }, null, 2);
  }
  if (trimmed === "/verify") {
    return runVerify((await runtime.verify()).path);
  }
  if (trimmed === "/verify-json") {
    const verification = await runtime.verify();
    return JSON.stringify({ ...verification, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed === "/review") {
    return runReview(await runtime.review());
  }
  if (trimmed === "/review-json") {
    return JSON.stringify({ path: await runtime.review(), status: runtime.getStatus() }, null, 2);
  }
  if (trimmed === "/handoff") {
    return runHandoff(await runtime.createHandoff());
  }
  if (trimmed === "/handoff-json") {
    return JSON.stringify({ path: await runtime.createHandoff() }, null, 2);
  }
  if (trimmed === "/resume") {
    return runResume(await runtime.resume());
  }
  if (trimmed === "/resume-json") {
    const phase = await runtime.resume();
    return JSON.stringify({ phase, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed === "/reset") {
    return `${runReset()}\n${await runtime.reset()}`;
  }
  if (trimmed === "/reset-json") {
    return JSON.stringify({ result: await runtime.reset(), status: runtime.getStatus() }, null, 2);
  }

  return runtime.handleInput(trimmed);
}

export function createPiHostedHarnessBridge(host: PiHostedHarnessHost): PiHostedHarnessBridge {
  const runtimePromise = HarnessRuntime.create(host.cwd, host.sessionId ?? "pi-hosted-session", {
    substrateAdapter: createHostedAdapter(host)
  });

  return {
    async getRuntime(): Promise<HarnessRuntime> {
      return runtimePromise;
    },
    async execute(input: string): Promise<string> {
      const runtime = await runtimePromise;
      return executeHostedCommand(runtime, input);
    }
  };
}
