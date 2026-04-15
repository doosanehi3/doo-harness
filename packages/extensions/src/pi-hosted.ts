import { createPiSubstrateAdapter, type PiSubstrateAdapter } from "../../ai/src/index.js";
import { HarnessRuntime } from "../../harness-runtime/src/index.js";
import { formatInvalidArtifactFilter, parseArtifactFilter, runArtifacts } from "../../cli/src/commands/handlers/artifacts.js";
import { runContinue } from "../../cli/src/commands/handlers/continue.js";
import { buildHelpPayload, runHelp } from "../../cli/src/commands/handlers/help.js";
import { runHandoff } from "../../cli/src/commands/handlers/handoff.js";
import { runLongRun } from "../../cli/src/commands/handlers/longrun.js";
import { runPlan } from "../../cli/src/commands/handlers/plan.js";
import { buildRecentPayload, runRecent } from "../../cli/src/commands/handlers/recent.js";
import { runReset } from "../../cli/src/commands/handlers/reset.js";
import { runResume } from "../../cli/src/commands/handlers/resume.js";
import { buildReviewPayload, runReview, type ReviewMode } from "../../cli/src/commands/handlers/review.js";
import { buildFindPayload, buildGrepPayload, buildRecentSearchPayload, runSearch } from "../../cli/src/commands/handlers/search.js";
import { buildCompactStatusView, buildStatusView, runCompactStatus, runStatus } from "../../cli/src/commands/handlers/status.js";
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
      if (payload[0] === "compact") {
        return json ? "/status-compact-json" : "/status-compact";
      }
      return json ? "/status-json" : "/status";
    case "artifacts":
      return json ? join("/artifacts-json", payload) : join("/artifacts", payload);
    case "plan":
      return json ? join("/plan-json", payload) : join("/plan", payload);
    case "longrun":
      return json ? join("/longrun-json", payload) : join("/longrun", payload);
    case "continue":
      return json ? "/continue-json" : "/continue";
    case "find":
      return json ? join("/find-json", payload) : join("/find", payload);
    case "grep":
      return json ? join("/grep-json", payload) : join("/grep", payload);
    case "recent":
      return json ? join("/recent-json", payload) : join("/recent", payload);
    case "verify":
      return json ? "/verify-json" : "/verify";
    case "review":
      return json ? join("/review-json", payload) : join("/review", payload);
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

async function executeHostedCommand(runtime: HarnessRuntime, cwd: string, input: string): Promise<string> {
  const trimmed = normalizeHostedInput(input);
  const statusPayload = buildStatusView(runtime.getStatus(), await runtime.listArtifacts());

  if (trimmed === "/help") {
    return runHelp();
  }
  if (trimmed === "/help-json") {
    return JSON.stringify(buildHelpPayload(), null, 2);
  }
  if (trimmed === "/status") {
    return runStatus(statusPayload);
  }
  if (trimmed === "/status-json") {
    return JSON.stringify(statusPayload, null, 2);
  }
  if (trimmed === "/status-compact" || trimmed === "/status compact") {
    return runCompactStatus(buildCompactStatusView(runtime.getStatus(), await runtime.listArtifacts()));
  }
  if (trimmed === "/status-compact-json" || trimmed === "/status compact --json") {
    return JSON.stringify(buildCompactStatusView(runtime.getStatus(), await runtime.listArtifacts()), null, 2);
  }
  if (trimmed === "/artifacts" || trimmed.startsWith("/artifacts ")) {
    const { filter, invalidFilter } = parseArtifactFilter(trimmed.replace(/^\/artifacts\s*/, ""));
    if (invalidFilter) {
      return formatInvalidArtifactFilter(invalidFilter);
    }
    return runArtifacts(await runtime.listArtifacts(), filter);
  }
  if (trimmed === "/artifacts-json" || trimmed.startsWith("/artifacts-json ")) {
    const { filter, invalidFilter } = parseArtifactFilter(trimmed.replace(/^\/artifacts-json\s*/, ""));
    if (invalidFilter) {
      return JSON.stringify({ error: formatInvalidArtifactFilter(invalidFilter) }, null, 2);
    }
    const artifacts = await runtime.listArtifacts();
    return JSON.stringify(filter ? artifacts.filter(artifact => artifact.type === filter) : artifacts, null, 2);
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
  if (trimmed.startsWith("/find-json")) {
    const query = trimmed.replace(/^\/find-json\s*/, "");
    return JSON.stringify(await buildFindPayload(cwd, query, runtime.getStatus()), null, 2);
  }
  if (trimmed.startsWith("/find")) {
    const query = trimmed.replace(/^\/find\s*/, "");
    return runSearch(await buildFindPayload(cwd, query, runtime.getStatus()));
  }
  if (trimmed.startsWith("/grep-json")) {
    const query = trimmed.replace(/^\/grep-json\s*/, "");
    return JSON.stringify(await buildGrepPayload(cwd, query, runtime.getStatus()), null, 2);
  }
  if (trimmed.startsWith("/grep")) {
    const query = trimmed.replace(/^\/grep\s*/, "");
    return runSearch(await buildGrepPayload(cwd, query, runtime.getStatus()));
  }
  if (trimmed === "/recent" || trimmed.startsWith("/recent ")) {
    const filter = trimmed.replace(/^\/recent\s*/, "");
    const parsed = parseArtifactFilter(filter);
    if (parsed.invalidFilter) {
      return formatInvalidArtifactFilter(parsed.invalidFilter);
    }
    return runRecent(buildRecentPayload(await runtime.listArtifacts(), filter, runtime.getStatus()));
  }
  if (trimmed === "/recent-json" || trimmed.startsWith("/recent-json ")) {
    const filter = trimmed.replace(/^\/recent-json\s*/, "");
    const parsed = parseArtifactFilter(filter);
    if (parsed.invalidFilter) {
      return JSON.stringify({ error: formatInvalidArtifactFilter(parsed.invalidFilter) }, null, 2);
    }
    return JSON.stringify(
      buildRecentSearchPayload(await runtime.listArtifacts(), filter, cwd, runtime.getStatus()),
      null,
      2
    );
  }
  if (trimmed === "/verify") {
    return runVerify((await runtime.verify()).path);
  }
  if (trimmed === "/verify-json") {
    const verification = await runtime.verify();
    return JSON.stringify({ ...verification, status: runtime.getStatus() }, null, 2);
  }
  if (trimmed === "/review" || trimmed.startsWith("/review ")) {
    const rawMode = trimmed.replace(/^\/review\s*/, "").trim();
    const mode: ReviewMode = rawMode === "diff" || rawMode === "deep" ? rawMode : "quick";
    const path = await runtime.review();
    return runReview(
      await buildReviewPayload(path, runtime.getStatus(), {
        mode,
        cwd,
        artifacts: await runtime.listArtifacts()
      })
    );
  }
  if (trimmed === "/review-json" || trimmed.startsWith("/review-json ")) {
    const rawMode = trimmed.replace(/^\/review-json\s*/, "").trim();
    const mode: ReviewMode = rawMode === "diff" || rawMode === "deep" ? rawMode : "quick";
    const path = await runtime.review();
    return JSON.stringify(
      {
        ...(await buildReviewPayload(path, runtime.getStatus(), {
          mode,
          cwd,
          artifacts: await runtime.listArtifacts()
        })),
        status: runtime.getStatus()
      },
      null,
      2
    );
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
      return executeHostedCommand(runtime, host.cwd, input);
    }
  };
}
