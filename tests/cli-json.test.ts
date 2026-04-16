import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import { HarnessRuntime } from "../packages/harness-runtime/src/runtime/harness-runtime.js";

const execFileAsync = promisify(execFile);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = dirname(TEST_DIR);

async function runCli(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("pnpm", ["run", "dev", "--", ...args], {
    cwd: HARNESS_ROOT,
    env: {
      ...process.env,
      HARNESS_CWD_OVERRIDE: cwd
    }
  });
  return stdout.trim();
}

async function runBin(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("pnpm", ["run", "start", "--", ...args], {
    cwd: HARNESS_ROOT,
    env: {
      ...process.env,
      HARNESS_CWD_OVERRIDE: cwd
    }
  });
  return stdout.trim();
}

async function runBinWithArgs(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("pnpm", ["run", "start", "--", ...args], {
    cwd: HARNESS_ROOT,
    env: {
      ...process.env
    }
  });
  return stdout.trim();
}

function extractJsonPayload(output: string): string {
  const lines = output.split("\n");
  const startIndex = lines.findIndex(line => {
    const trimmed = line.trim();
    return trimmed.startsWith("{") || trimmed.startsWith("[");
  });

  if (startIndex === -1) {
    throw new Error(`No JSON payload found in output:\n${output}`);
  }

  return lines.slice(startIndex).join("\n").trim();
}

test("status-json returns machine-readable runtime status without panel text", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI status json demo", true);

    const output = await runCli(cwd, "/status-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      phase: string;
      flow: string;
      activeTaskId: string;
      activeTaskRecoveryHint: string | null;
      handoffEligible: boolean;
      handoffReason: string | null;
      resumePhase: string | null;
      recentArtifacts: string[];
    };

    assert.equal(parsed.phase, "planning");
    assert.equal(parsed.flow, "milestone");
    assert.equal(parsed.activeTaskId, "T1");
    assert.equal(parsed.activeTaskRecoveryHint, null);
    assert.equal(parsed.handoffEligible, true);
    assert.equal(parsed.handoffReason, null);
    assert.equal(parsed.resumePhase, null);
    assert.ok(Array.isArray(parsed.recentArtifacts));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status compact json returns a machine-readable compact summary", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-compact-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI status compact demo", true);

    const output = await runCli(cwd, "status", "compact", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      compact: boolean;
      phase: string;
      activeTaskId: string | null;
      nextAction: string | null;
      recentArtifacts: string[];
    };

    assert.equal(parsed.compact, true);
    assert.equal(parsed.phase, "planning");
    assert.equal(parsed.activeTaskId, "T1");
    assert.match(parsed.nextAction ?? "", /\/continue/);
    assert.ok(Array.isArray(parsed.recentArtifacts));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status lanes json returns active and ready lane summaries", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-lanes-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI status lanes demo", true);

    const output = await runCli(cwd, "status", "lanes", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      active: { taskId: string | null; owner: string | null; executionMode: string; modelId: string };
      ready: Array<{ taskId: string; owner: string | null }>;
    };

    assert.equal(parsed.mode, "lanes");
    assert.equal(parsed.active.taskId, "T1");
    assert.equal(parsed.active.owner, "planner");
    assert.ok(parsed.active.executionMode.length > 0);
    assert.ok(parsed.active.modelId.length > 0);
    assert.ok(parsed.ready.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status readiness json returns aggregated readiness guidance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-readiness-"));
  try {
    const output = await runCli(cwd, "status", "readiness", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      configReady: boolean;
      providerReady: boolean;
      handoffReady: boolean;
      recommendedCommand: string;
      summary: string;
      validationTracks: Array<{ kind: string; commands: string[] }>;
    };

    assert.equal(parsed.mode, "readiness");
    assert.equal(typeof parsed.configReady, "boolean");
    assert.equal(typeof parsed.providerReady, "boolean");
    assert.equal(typeof parsed.handoffReady, "boolean");
    assert.ok(parsed.recommendedCommand.length > 0);
    assert.ok(parsed.summary.length > 0);
    assert.ok(parsed.validationTracks.some(track => track.kind === "local"));
    assert.ok(parsed.validationTracks.some(track => track.kind === "interactive"));
    assert.ok(parsed.validationTracks.some(track => track.kind === "release"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status ship json returns release checklist and release note sections", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-ship-"));
  try {
    const output = await runCli(cwd, "status", "ship", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      shipReady: boolean;
      recommendedCommand: string;
      summary: string;
      releaseChecks: string[];
      releaseNotes: string[];
    };

    assert.equal(parsed.mode, "ship");
    assert.equal(typeof parsed.shipReady, "boolean");
    assert.ok(parsed.recommendedCommand.length > 0);
    assert.ok(parsed.summary.length > 0);
    assert.ok(parsed.releaseChecks.length > 0);
    assert.ok(parsed.releaseNotes.includes("Summary"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status today json returns a single operator briefing payload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-today-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI status today demo", true);

    const output = await runCli(cwd, "status", "today", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      phase: string;
      goal: string | null;
      nextAction: string | null;
      summary: string;
      blockerCount: number;
      reviewQueueCount: number;
      pickupKind: string;
      activeLane: { taskId: string | null; owner: string | null };
      readinessRecommendedCommand: string;
      shipRecommendedCommand: string;
    };

    assert.equal(parsed.mode, "today");
    assert.equal(parsed.phase, "planning");
    assert.ok(parsed.goal?.length);
    assert.ok(parsed.nextAction?.length);
    assert.ok(parsed.summary.length > 0);
    assert.equal(typeof parsed.blockerCount, "number");
    assert.equal(typeof parsed.reviewQueueCount, "number");
    assert.ok(parsed.pickupKind.length > 0);
    assert.equal(parsed.activeLane.taskId, "T1");
    assert.ok(parsed.readinessRecommendedCommand.length > 0);
    assert.ok(parsed.shipRecommendedCommand.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status dashboard json returns a grouped action-oriented summary", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-dashboard-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI status dashboard demo", true);
    await runtime.blockCurrentTask("waiting on API schema");

    const output = await runCli(cwd, "status", "dashboard", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      blocked: { items: unknown[] };
      reviewQueue: { items: unknown[] };
      pickup: { pickupKind: string };
      handoff: { eligible: boolean; reason: string | null; path: string | null };
      auto: { recommendedCommand: string; rationale: string };
    };

    assert.equal(parsed.mode, "dashboard");
    assert.ok(parsed.blocked.items.length > 0);
    assert.ok(Array.isArray(parsed.reviewQueue.items));
    assert.equal(parsed.pickup.pickupKind, "blocked");
    assert.equal(typeof parsed.handoff.eligible, "boolean");
    assert.ok(parsed.auto.recommendedCommand.length > 0);
    assert.ok(parsed.auto.rationale.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("split-arg slash-form status compact json resolves to the compact status surface", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-compact-slash-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI status compact slash demo", true);

    const output = await runCli(cwd, "/status compact --json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      compact: boolean;
      phase: string;
      activeTaskId: string | null;
    };

    assert.equal(parsed.compact, true);
    assert.equal(parsed.phase, "planning");
    assert.equal(parsed.activeTaskId, "T1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("slash-form status compact json resolves to the compact status surface", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-status-compact-slash-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI slash compact demo", true);

    const output = await runCli(cwd, "/status", "compact", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      compact: boolean;
      phase: string;
      activeTaskId: string | null;
    };

    assert.equal(parsed.compact, true);
    assert.equal(parsed.phase, "planning");
    assert.equal(parsed.activeTaskId, "T1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("help-json returns machine-readable onboarding data", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-help-"));
  try {
    const output = await runCli(cwd, "/help-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      overview: string;
      quickStart: string[];
      contextual: { focus: string; reason: string; commands: string[] };
      commandGroups: Array<{ title: string; commands: string[] }>;
    };

    assert.match(parsed.overview, /pi-ready runtime-core product/i);
    assert.ok(parsed.quickStart.some(line => line.includes("config init")));
    assert.ok(parsed.quickStart.some(line => line.includes("harness help")));
    assert.ok(parsed.contextual.focus.length > 0);
    assert.ok(parsed.contextual.reason.length > 0);
    assert.ok(parsed.contextual.commands.length > 0);
    assert.ok(parsed.commandGroups.some(group => group.title === "Operator Loop"));
    assert.ok(parsed.commandGroups.some(group => group.title === "Provider"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("help-json switches to paused-recovery focus when runtime is blocked", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-help-blocked-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI help blocked demo", true);
    await runtime.blockCurrentTask("waiting on API schema");

    const output = await runCli(cwd, "/help-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      contextual: { focus: string; commands: string[] };
    };

    assert.equal(parsed.contextual.focus, "paused-recovery");
    assert.ok(parsed.contextual.commands.includes("harness blocked --json"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("plan-json returns machine-readable planning artifact paths", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-plan-"));
  try {
    const output = await runCli(cwd, "/plan-json", "CLI plan json demo");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      specPath: string;
      planPath: string;
      status: { phase: string; activeTaskId: string | null };
    };

    assert.match(parsed.specPath, /spec\.md$/);
    assert.match(parsed.planPath, /plan\.md$/);
    assert.equal(parsed.status.phase, "planning");
    assert.equal(parsed.status.activeTaskId, "T1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("longrun-json returns machine-readable long-running planning paths", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-longrun-"));
  try {
    const output = await runCli(cwd, "/longrun-json", "CLI longrun json demo");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      specPath: string;
      planPath: string;
      milestonePath?: string;
      status: { phase: string; flow: string; activeMilestoneId: string | null };
    };

    assert.match(parsed.specPath, /spec\.md$/);
    assert.match(parsed.planPath, /plan\.md$/);
    assert.match(parsed.milestonePath ?? "", /milestones\.md$/);
    assert.equal(parsed.status.phase, "planning");
    assert.equal(parsed.status.flow, "milestone");
    assert.equal(parsed.status.activeMilestoneId, "M1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts-json returns machine-readable artifact metadata without panel text", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-artifacts-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI artifacts json demo", true);

    const output = await runCli(cwd, "/artifacts-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as Array<{ type: string }>;

    assert.ok(parsed.some(item => item.type === "spec"));
    assert.ok(parsed.some(item => item.type === "plan"));
    assert.ok(parsed.some(item => item.type === "milestones"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts-json can filter by artifact type", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-artifacts-filter-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI artifacts filter demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const output = await runCli(cwd, "artifacts", "review", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as Array<{ type: string; path: string }>;

    assert.ok(parsed.length > 0);
    assert.ok(parsed.every(item => item.type === "review"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts inspect json returns latest artifact metadata and preview", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-artifact-inspect-latest-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI artifacts inspect latest demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await runCli(cwd, "artifacts", "inspect", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      target: string;
      resolvedBy: string;
      artifact: { type: string; path: string };
      preview: string[];
    };

    assert.equal(parsed.mode, "artifact-inspect");
    assert.equal(parsed.target, "latest");
    assert.equal(parsed.resolvedBy, "latest");
    assert.ok(parsed.artifact.path.length > 0);
    assert.ok(parsed.preview.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts inspect json can resolve by artifact type", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-artifact-inspect-type-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI artifacts inspect type demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const output = await runCli(cwd, "artifacts", "inspect", "review", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      resolvedBy: string;
      artifact: { type: string; path: string };
      preview: string[];
    };

    assert.equal(parsed.mode, "artifact-inspect");
    assert.equal(parsed.resolvedBy, "type");
    assert.equal(parsed.artifact.type, "review");
    assert.ok(parsed.artifact.path.includes("/reviews/"));
    assert.ok(parsed.preview.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts-json returns newest artifacts first by updatedAt", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-artifacts-order-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI artifacts order demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const output = await runCli(cwd, "/artifacts-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as Array<{ updatedAt: string }>;

    assert.ok(parsed.length > 1);
    for (let index = 1; index < parsed.length; index += 1) {
      assert.ok((parsed[index - 1]?.updatedAt ?? "") >= (parsed[index]?.updatedAt ?? ""));
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts-json rejects invalid artifact filters instead of broadening scope", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-artifacts-invalid-filter-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI artifacts invalid filter demo", true);

    const output = await runCli(cwd, "artifacts", "not-a-real-type", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as { error: string };

    assert.match(parsed.error, /Unknown artifact filter/i);
    assert.match(parsed.error, /not-a-real-type/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("verify-json returns machine-readable verification result", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-verify-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI verify json demo", false);
    await runtime.executeCurrentTask();

    const output = await runCli(cwd, "/verify-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      path: string;
      result: { status: string; mode?: string | null };
      status: { phase: string; lastVerificationStatus: string | null };
    };

    assert.match(parsed.path, /verifications\/.+\.md$/);
    assert.ok(["pass", "fail", "partial", "blocked"].includes(parsed.result.status));
    assert.equal(parsed.status.lastVerificationStatus, parsed.result.status);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("config-show returns resolved config JSON without panel text", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-config-"));
  try {
    const output = await runCli(cwd, "/config-show");
    const parsed = JSON.parse(extractJsonPayload(output)) as { models: { default: { id: string } } };

    assert.equal(parsed.models.default.id, "stub");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("config-init-openai-codex writes a codex subscription profile", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-config-codex-"));
  try {
    const output = await runCli(cwd, "/config-init-openai-codex");

    assert.match(output, /Runtime config ready \(openai-codex\):/);

    const show = await runCli(cwd, "/config-show");
    const parsed = JSON.parse(extractJsonPayload(show)) as {
      models: { default: { provider: string; authSource: string } };
    };

    assert.equal(parsed.models.default.provider, "openai-codex");
    assert.equal(parsed.models.default.authSource, "pi-auth");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor-json reports shell readiness and next steps", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-doctor-"));
  try {
    const output = await runCli(cwd, "doctor", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      ready: boolean;
      tools: Array<{ name: string; installed: boolean; required: boolean; installCommand: string }>;
      nextSteps: string[];
      firstRunCommands: string[];
      validationTracks: Array<{ kind: string; commands: string[] }>;
      recommendedCommand: string;
    };

    assert.equal(parsed.mode, "doctor");
    assert.equal(typeof parsed.ready, "boolean");
    assert.ok(parsed.tools.some(item => item.name === "node"));
    assert.ok(parsed.tools.every(item => item.installCommand.length > 0));
    assert.ok(parsed.nextSteps.length > 0);
    assert.ok(parsed.firstRunCommands.length > 0);
    assert.ok(parsed.validationTracks.some(track => track.kind === "local"));
    assert.ok(parsed.validationTracks.some(track => track.kind === "interactive"));
    assert.ok(parsed.validationTracks.some(track => track.kind === "release"));
    assert.ok(parsed.recommendedCommand.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("plain doctor output stays onboarding-only without runtime panel", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-doctor-plain-"));
  try {
    const output = await runCli(cwd, "doctor");
    assert.match(output, /Tools:/);
    assert.match(output, /Recommended:/);
    assert.match(output, /First-run commands:/);
    assert.match(output, /Validation tracks:/);
    assert.doesNotMatch(output, /^Phase:/m);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bootstrap-json reports preset guidance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bootstrap-"));
  try {
    const output = await runCli(cwd, "bootstrap", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      recommendedPreset: string;
      recommendedReason: string;
      nextCommands: string[];
      presets: Array<{ id: string; kickoff: string }>;
    };

    assert.equal(parsed.mode, "bootstrap");
    assert.ok(parsed.recommendedPreset.length > 0);
    assert.ok(parsed.recommendedReason.length > 0);
    assert.ok(parsed.nextCommands.length > 0);
    assert.ok(parsed.presets.some(item => item.id === "node-cli"));
    assert.ok(parsed.presets.some(item => /longrun/.test(item.kickoff)));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bootstrap-json rejects invalid presets explicitly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bootstrap-invalid-"));
  try {
    const output = await runCli(cwd, "bootstrap", "nope", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as { error: string };
    assert.match(parsed.error, /Unknown bootstrap preset/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("provider-check-json returns machine-readable provider readiness", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-provider-"));
  try {
    const output = await runCli(cwd, "/provider-check-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as Array<{
      role: string;
      authSource: string;
      envVar: string;
      credentialLocation: string;
      hasApiKey: boolean;
      status: string;
      suggestedAction: string;
    }>;

    assert.equal(parsed.length, 4);
    assert.equal(parsed[0]?.role, "default");
    assert.equal(parsed[0]?.authSource, "env");
    assert.equal(parsed[0]?.envVar, "OPENAI_API_KEY");
    assert.equal(parsed[0]?.credentialLocation, "OPENAI_API_KEY");
    assert.equal(parsed[0]?.hasApiKey, false);
    assert.equal(parsed[0]?.status, "missing_credentials");
    assert.match(parsed[0]?.suggestedAction ?? "", /Set OPENAI_API_KEY/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("provider-smoke-json returns machine-readable smoke result", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-provider-smoke-"));
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "READY" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const runtime = await HarnessRuntime.create(cwd);
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            default: {
              id: "gpt-test",
              provider: "openai-compatible",
              baseUrl: `http://127.0.0.1:${address.port}`
            }
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    void runtime;

    const output = await runCli(cwd, "/provider-smoke-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      role: string;
      provider: string;
      modelId: string;
      durationMs: number;
      stopReason: string;
      text: string;
    };

    assert.equal(parsed.role, "default");
    assert.equal(parsed.provider, "openai-compatible");
    assert.equal(parsed.modelId, "gpt-test");
    assert.ok(parsed.durationMs >= 0);
    assert.equal(parsed.stopReason, "stop");
    assert.equal(parsed.text, "READY");
  } finally {
    delete process.env.OPENAI_API_KEY;
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("provider-doctor-json returns readiness plus smoke results", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-provider-doctor-"));
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "READY" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            default: {
              id: "gpt-test",
              provider: "openai-compatible",
              baseUrl: `http://127.0.0.1:${address.port}`
            }
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const output = await runCli(cwd, "/provider-doctor-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as Array<{
      role: string;
      readiness: { status: string };
      smoke?: { durationMs: number; stopReason: string; text: string };
    }>;

    assert.equal(parsed[0]?.role, "default");
    assert.equal(parsed[0]?.readiness.status, "ready");
    assert.ok((parsed[0]?.smoke?.durationMs ?? -1) >= 0);
    assert.equal(parsed[0]?.smoke?.stopReason, "stop");
    assert.equal(parsed[0]?.smoke?.text, "READY");
  } finally {
    delete process.env.OPENAI_API_KEY;
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("web-smoke-json returns machine-readable web smoke result", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-web-smoke-"));
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "web-smoke-demo",
          private: true,
          type: "module",
          scripts: {
            start: "node server.js"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(
      join(cwd, "server.js"),
      `import { createServer } from "node:http";\nconst port = Number.parseInt(process.env.PORT ?? "4180", 10);\ncreateServer((_, res) => {\n  res.setHeader("content-type", "text/html; charset=utf-8");\n  res.end('<!doctype html><title>Web Smoke Demo</title><main><h1>Catalog preview</h1></main>');\n}).listen(port, "127.0.0.1", () => {\n  console.log('Catalog app ready at http://127.0.0.1:' + port);\n});\n`,
      "utf8"
    );

    const output = await runCli(cwd, "/web-smoke-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      success: boolean;
      url: string;
      statusCode: number;
      title: string;
      bodySnippet: string;
      durationMs: number;
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.statusCode, 200);
    assert.equal(parsed.title, "Web Smoke Demo");
    assert.match(parsed.url, /127\.0\.0\.1:/);
    assert.match(parsed.bodySnippet, /Catalog preview/);
    assert.ok(parsed.durationMs >= 0);
    await new Promise(resolve => setTimeout(resolve, 300));
    await assert.rejects(fetch(parsed.url));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("web-verify-json returns machine-readable web verification result", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-web-verify-"));
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "web-verify-demo",
          private: true,
          type: "module",
          scripts: {
            start: "node server.js"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(
      join(cwd, "server.js"),
      `import { createServer } from "node:http";\nconst port = Number.parseInt(process.env.PORT ?? "4180", 10);\ncreateServer((_, res) => {\n  res.setHeader("content-type", "text/html; charset=utf-8");\n  res.end('<!doctype html><title>Web Verify Demo</title><main><h1>Catalog preview</h1></main>');\n}).listen(port, "127.0.0.1", () => {\n  console.log('Catalog app ready at http://127.0.0.1:' + port);\n});\n`,
      "utf8"
    );

    const output = await runCli(cwd, "/web-verify-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      success: boolean;
      title: string;
      snapshotPath?: string;
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.title, "Web Verify Demo");
    assert.ok(Boolean(parsed.snapshotPath));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry can execute help-json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-"));
  try {
    const output = await runBin(cwd, "/help-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as { overview: string };

    assert.match(parsed.overview, /long-running coding runtime/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry accepts --cwd for target repo selection", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-cwd-"));
  try {
    const output = await runBinWithArgs("--cwd", cwd, "/status-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as { phase: string; flow: string };

    assert.equal(parsed.phase, "idle");
    assert.equal(parsed.flow, "auto");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry supports product-style status --json subcommands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-status-subcmd-"));
  try {
    const output = await runBinWithArgs("--cwd", cwd, "status", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as { phase: string; flow: string };

    assert.equal(parsed.phase, "idle");
    assert.equal(parsed.flow, "auto");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry supports product-style longrun --json subcommands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-longrun-subcmd-"));
  try {
    const output = await runBinWithArgs("--cwd", cwd, "longrun", "--json", "CLI subcommand demo");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      specPath: string;
      planPath: string;
      milestonePath?: string;
      status: { phase: string; flow: string };
    };

    assert.match(parsed.specPath, /spec\.md$/);
    assert.match(parsed.planPath, /plan\.md$/);
    assert.match(parsed.milestonePath ?? "", /milestones\.md$/);
    assert.equal(parsed.status.phase, "planning");
    assert.equal(parsed.status.flow, "milestone");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry supports product-style auto --json subcommands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-auto-subcmd-"));
  try {
    const output = await runBinWithArgs("--cwd", cwd, "auto", "--json", "--steps", "0", "CLI auto subcommand demo");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      startedNewPlan: boolean;
      specPath: string | null;
      planPath: string | null;
      stopReason: string;
    };

    assert.equal(parsed.mode, "auto");
    assert.equal(parsed.startedNewPlan, true);
    assert.match(parsed.specPath ?? "", /spec\.md$/);
    assert.match(parsed.planPath ?? "", /plan\.md$/);
    assert.equal(parsed.stopReason, "max_steps");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry supports product-style provider smoke --json subcommands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-provider-smoke-subcmd-"));
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "READY" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            default: {
              id: "gpt-test",
              provider: "openai-compatible",
              baseUrl: `http://127.0.0.1:${address.port}`
            }
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const output = await runBinWithArgs("--cwd", cwd, "provider", "smoke", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      role: string;
      provider: string;
      modelId: string;
      stopReason: string;
      text: string;
    };

    assert.equal(parsed.role, "default");
    assert.equal(parsed.provider, "openai-compatible");
    assert.equal(parsed.modelId, "gpt-test");
    assert.equal(parsed.stopReason, "stop");
    assert.equal(parsed.text, "READY");
  } finally {
    delete process.env.OPENAI_API_KEY;
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry supports product-style web smoke --json subcommands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-web-smoke-subcmd-"));
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "web-smoke-demo",
          private: true,
          type: "module",
          scripts: {
            start: "node server.js"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(
      join(cwd, "server.js"),
      `import { createServer } from "node:http";\nconst port = Number.parseInt(process.env.PORT ?? "4180", 10);\ncreateServer((_, res) => {\n  res.setHeader("content-type", "text/html; charset=utf-8");\n  res.end('<!doctype html><title>Web Smoke Demo</title><main><h1>Catalog preview</h1></main>');\n}).listen(port, "127.0.0.1", () => {\n  console.log('Catalog app ready at http://127.0.0.1:' + port);\n});\n`,
      "utf8"
    );

    const output = await runBinWithArgs("--cwd", cwd, "web", "smoke", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      success: boolean;
      url: string;
      title: string;
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.title, "Web Smoke Demo");
    await new Promise(resolve => setTimeout(resolve, 300));
    await assert.rejects(fetch(parsed.url));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry supports product-style web verify --json subcommands", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-web-verify-subcmd-"));
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "web-verify-demo",
          private: true,
          type: "module",
          scripts: {
            start: "node server.js"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(
      join(cwd, "server.js"),
      `import { createServer } from "node:http";\nconst port = Number.parseInt(process.env.PORT ?? "4180", 10);\ncreateServer((_, res) => {\n  res.setHeader("content-type", "text/html; charset=utf-8");\n  res.end('<!doctype html><title>Web Verify Demo</title><main><h1>Catalog preview</h1></main>');\n}).listen(port, "127.0.0.1", () => {\n  console.log('Catalog app ready at http://127.0.0.1:' + port);\n});\n`,
      "utf8"
    );

    const output = await runBinWithArgs("--cwd", cwd, "web", "verify", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      success: boolean;
      title: string;
      snapshotPath?: string;
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.title, "Web Verify Demo");
    assert.ok(Boolean(parsed.snapshotPath));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bin entry uses --cwd for product-style config show", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-bin-config-show-subcmd-"));
  try {
    await runCli(cwd, "/config-init-openai-codex");
    const output = await runBinWithArgs("--cwd", cwd, "config", "show");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      models: { default: { provider: string; authSource: string } };
    };

    assert.equal(parsed.models.default.provider, "openai-codex");
    assert.equal(parsed.models.default.authSource, "pi-auth");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("loop-json returns machine-readable completion steps without panel text", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-loop-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI loop json demo", true);
    const taskState = runtime.getTaskStateSnapshot();
    taskState.taskVerificationCommands.T2 = ["printf verified"];
    taskState.taskVerificationCommands.T3 = ["printf verified"];
    const { saveTaskState } = await import("../packages/harness-runtime/src/state/task-state.js");
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);

    const output = await runCli(cwd, "/loop-json", "10");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      steps: string[];
      stopReason: string;
      finalPhase: string;
      finalMilestoneId: string | null;
      finalTaskId: string | null;
      blocker: string | null;
      completed: boolean;
    };

    assert.ok(parsed.steps.length > 0);
    assert.ok(parsed.steps.some(step => step.includes("verification")));
    assert.equal(parsed.completed, true);
    assert.equal(parsed.stopReason, "completed");
    assert.equal(parsed.finalPhase, "completed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("auto-json starts a new autonomous goal loop from idle", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-auto-idle-"));
  try {
    const output = await runCli(cwd, "auto", "--json", "--steps", "0", "CLI auto idle demo");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      entry: string;
      startedNewPlan: boolean;
      specPath: string | null;
      planPath: string | null;
      milestonePath: string | null;
      stopReason: string;
      nextAction: string | null;
    };

    assert.equal(parsed.mode, "auto");
    assert.equal(parsed.entry, "planned");
    assert.equal(parsed.startedNewPlan, true);
    assert.match(parsed.specPath ?? "", /spec\.md$/);
    assert.match(parsed.planPath ?? "", /plan\.md$/);
    assert.match(parsed.milestonePath ?? "", /milestones\.md$/);
    assert.equal(parsed.stopReason, "max_steps");
    assert.match(parsed.nextAction ?? "", /\/continue|\/execute|\/verify/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("auto-json resumes an active goal and can complete the loop", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-auto-resume-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI auto resume demo", true);
    const taskState = runtime.getTaskStateSnapshot();
    taskState.taskVerificationCommands.T2 = ["printf verified"];
    taskState.taskVerificationCommands.T3 = ["printf verified"];
    const { saveTaskState } = await import("../packages/harness-runtime/src/state/task-state.js");
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);

    const output = await runCli(cwd, "auto", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      entry: string;
      startedNewPlan: boolean;
      completed: boolean;
      stopReason: string;
      finalPhase: string;
      steps: string[];
    };

    assert.equal(parsed.mode, "auto");
    assert.equal(parsed.entry, "continued");
    assert.equal(parsed.startedNewPlan, false);
    assert.equal(parsed.completed, true);
    assert.equal(parsed.stopReason, "completed");
    assert.equal(parsed.finalPhase, "completed");
    assert.ok(parsed.steps.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("review-json returns a machine-readable review artifact payload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-review-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review json demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await runCli(cwd, "/review-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      target: string;
      path: string;
      summary: string;
      preview: string[];
      diffStat: string[];
      history: string[];
      verificationStatus: string | null;
      status: { phase: string; activeTaskId: string | null };
    };

    assert.equal(parsed.mode, "quick");
    assert.equal(parsed.target, "active-task:T1");
    assert.match(parsed.path, /reviews\/.+\.md$/);
    assert.match(parsed.summary, /Fast review/i);
    assert.ok(parsed.preview.length > 0);
    assert.deepEqual(parsed.diffStat, []);
    assert.deepEqual(parsed.history, []);
    assert.equal(parsed.verificationStatus, "pass");
    assert.equal(parsed.status.phase, "paused");
    assert.equal(parsed.status.activeTaskId, "T1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("review diff and deep expose richer mode-specific payloads", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-review-modes-"));
  try {
    await execFileAsync("git", ["init"], { cwd });
    await writeFile(join(cwd, "fresh-review-target.md"), "# fresh review target\n", "utf8");

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review mode demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const diffOutput = await runCli(cwd, "review", "diff", "--json");
    const diffParsed = JSON.parse(extractJsonPayload(diffOutput)) as {
      mode: string;
      target: string;
      diffStat: string[];
    };

    assert.equal(diffParsed.mode, "diff");
    assert.equal(diffParsed.target, "working-tree-diff");
    assert.ok(diffParsed.diffStat.length > 0);
    assert.ok(diffParsed.diffStat.some(line => line.includes("fresh-review-target.md")));

    const deepOutput = await runCli(cwd, "review", "deep", "--json");
    const deepParsed = JSON.parse(extractJsonPayload(deepOutput)) as {
      mode: string;
      history: string[];
      synthesis: string[];
    };

    assert.equal(deepParsed.mode, "deep");
    assert.ok(Array.isArray(deepParsed.history));
    assert.ok(Array.isArray(deepParsed.synthesis));
    assert.ok(deepParsed.synthesis.some(line => line.startsWith("History count:")));
    assert.ok(deepParsed.synthesis.some(line => line.startsWith("Verification context:")));
    assert.ok(deepParsed.synthesis.some(line => line.startsWith("Recommended next move:")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("review compare json returns compare metadata and synthesized refs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-review-compare-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review compare demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const output = await runCli(cwd, "review", "compare", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      comparedRefs: string[];
      preview: string[];
      synthesis: string[];
      status: { phase: string };
    };

    assert.equal(parsed.mode, "compare");
    assert.ok(parsed.comparedRefs.length >= 2);
    assert.ok(parsed.preview.length > 0);
    assert.ok(parsed.synthesis.some(line => line.startsWith("Compared refs:")));
    assert.ok(parsed.synthesis.some(line => line.startsWith("Recommended next move:")));
    assert.ok(["paused", "completed"].includes(parsed.status.phase));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("review compare ignores preserved handoff when review and verification are absent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-review-compare-reset-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review compare reset demo", true);
    await runtime.createHandoff();
    await runtime.reset();

    const output = await runCli(cwd, "review", "compare", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      path: string;
      comparedRefs: string[];
      history: string[];
      synthesis: string[];
    };

    assert.equal(parsed.mode, "compare");
    assert.equal(parsed.path, "(compare)");
    assert.deepEqual(parsed.comparedRefs, []);
    assert.ok(parsed.history.some(item => item.includes("handoff:")));
    assert.ok(parsed.synthesis.some(line => line.includes("(none)")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("review history json exposes recent review-related artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-review-history-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review history demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const output = await runCli(cwd, "review", "history", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      target: string;
      history: string[];
    };

    assert.equal(parsed.mode, "history");
    assert.equal(parsed.target, "review-history");
    assert.ok(parsed.history.some(item => item.includes("review:")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("review artifact json inspects the selected artifact target", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-review-artifact-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review artifact demo", true);
    await runtime.executeCurrentTask();
    const verification = await runtime.verify();

    const output = await runCli(cwd, "review", "artifact", "verification", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      target: string;
      path: string;
      preview: string[];
    };

    assert.equal(parsed.mode, "artifact");
    assert.equal(parsed.target, "artifact:verification");
    assert.match(parsed.path, /verifications\/.+\.md$/);
    assert.ok(parsed.preview.length > 0);

    const relativeVerificationPath = verification.path.replace(`${cwd}/`, "");
    const byRelativePathOutput = await runCli(cwd, "review", "artifact", relativeVerificationPath, "--json");
    const byRelativePathParsed = JSON.parse(extractJsonPayload(byRelativePathOutput)) as {
      mode: string;
      path: string;
    };
    assert.equal(byRelativePathParsed.mode, "artifact");
    assert.equal(byRelativePathParsed.path, verification.path);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("review diff can narrow to a target path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-review-diff-target-"));
  try {
    await execFileAsync("git", ["init"], { cwd });
    await writeFile(join(cwd, "target-a.md"), "# target a\n", "utf8");
    await writeFile(join(cwd, "target-a.md.bak"), "# target a backup\n", "utf8");
    await writeFile(join(cwd, "target-b.md"), "# target b\n", "utf8");

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review diff target demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await runCli(cwd, "review", "diff", "target-a.md", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      target: string;
      diffStat: string[];
    };

    assert.equal(parsed.mode, "diff");
    assert.equal(parsed.target, "working-tree-diff:target-a.md");
    assert.ok(parsed.diffStat.every(line => line.includes("target-a.md")));
    assert.ok(parsed.diffStat.every(line => !line.includes("target-a.md.bak")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("find-json returns a machine-readable file search payload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-find-"));
  try {
    await writeFile(join(cwd, "catalog-plan.md"), "# catalog plan\n", "utf8");

    const output = await runCli(cwd, "/find-json", "plan");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      query: string;
      matches: string[];
    };

    assert.equal(parsed.mode, "find");
    assert.equal(parsed.query, "plan");
    assert.ok(parsed.matches.some(line => line.includes("catalog-plan.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("grep-json returns a machine-readable content search payload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-grep-"));
  try {
    await writeFile(join(cwd, "catalog-notes.md"), "catalog release readiness\n", "utf8");

    const output = await runCli(cwd, "/grep-json", "release readiness");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      query: string;
      matches: string[];
    };

    assert.equal(parsed.mode, "grep");
    assert.equal(parsed.query, "release readiness");
    assert.ok(parsed.matches.some(line => line.includes("catalog-notes.md:1:catalog release readiness")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("recent-json returns recent artifact recall payload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-recent-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI recent review demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const output = await runCli(cwd, "recent", "review", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      query: string;
      matches: string[];
    };

    assert.equal(parsed.mode, "recent");
    assert.equal(parsed.query, "review");
    assert.ok(parsed.matches.some(line => line.includes("/reviews/")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("recent-json supports failure recall presets", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-recent-failures-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI recent failures demo", true);
    await runtime.verify();

    const output = await runCli(cwd, "recent", "failures", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      query: string;
      matches: string[];
      groups: Array<{ label: string }>;
    };

    assert.equal(parsed.mode, "recent");
    assert.equal(parsed.query, "failures");
    assert.ok(parsed.matches.some(line => line.includes("/verifications/")));
    assert.ok(parsed.groups.some(group => group.label === "recent failures"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("recent-json supports active-task recall presets", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-recent-active-task-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI recent active-task demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await runCli(cwd, "recent", "active-task", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      query: string;
      matches: string[];
      groups: Array<{ label: string }>;
    };

    assert.equal(parsed.mode, "recent");
    assert.equal(parsed.query, "active-task");
    assert.ok(parsed.matches.length > 0);
    assert.ok(parsed.groups.some(group => group.label === "recent active-task"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("recent-json groups unfiltered artifacts by type", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-recent-groups-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI recent groups demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const output = await runCli(cwd, "recent", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      groups: Array<{ label: string; matches: string[] }>;
    };

    assert.equal(parsed.mode, "recent");
    assert.ok(parsed.groups.some(group => group.label === "recent review"));
    assert.ok(parsed.groups.some(group => group.label === "recent verification"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts and recent report invalid filters explicitly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-invalid-filter-"));
  try {
    const artifactsOutput = await runCli(cwd, "artifacts", "not-a-real-type", "--json");
    const artifactsParsed = JSON.parse(extractJsonPayload(artifactsOutput)) as { error: string };
    assert.match(artifactsParsed.error, /Unknown artifact filter/);

    const recentOutput = await runCli(cwd, "recent", "bad-filter", "--json");
    const recentParsed = JSON.parse(extractJsonPayload(recentOutput)) as { error: string };
    assert.match(recentParsed.error, /Unknown artifact filter/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("blocked-json reports blocked tasks and blockers", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-blocked-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI blocked queue demo", true);
    await runtime.blockCurrentTask("waiting on API schema");

    const output = await runCli(cwd, "blocked", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      items: Array<{ taskId: string; blocker: string; recoveryRecommendation: string }>;
    };

    assert.equal(parsed.mode, "blocked");
    assert.ok(parsed.items.some(item => item.taskId === "T1" && /API schema/.test(item.blocker)));
    assert.ok(parsed.items.some(item => /continue|Inspect/i.test(item.recoveryRecommendation)));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("queue review json reports review-related work", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-queue-review-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review queue demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await runCli(cwd, "queue", "review", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      queue: string;
      items: Array<{ kind: string; label: string; priority: string; rationale: string; score: number; recommendedCommand: string }>;
    };

    assert.equal(parsed.mode, "queue");
    assert.equal(parsed.queue, "review");
    assert.ok(parsed.items.length > 0);
    assert.equal(parsed.items[0]?.priority, "high");
    assert.ok(parsed.items.some(item => item.rationale.length > 0));
    assert.equal(typeof parsed.items[0]?.score, "number");
    assert.ok(parsed.items[0]?.recommendedCommand.length > 0);
    assert.ok((parsed.items[0]?.score ?? 0) >= (parsed.items[1]?.score ?? 0));
    assert.equal(new Set(parsed.items.filter(item => item.priority === "high").map(item => item.label)).size, parsed.items.filter(item => item.priority === "high").length);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pickup-json reports the next safe work recommendation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-pickup-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI pickup demo", true);

    const output = await runCli(cwd, "pickup", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      pickupKind: string;
      target: string | null;
      rationale: string;
      nextAction: string | null;
      recommendedCommand: string;
      alternatives: string[];
      urgency: string;
    };

    assert.equal(parsed.mode, "pickup");
    assert.equal(parsed.pickupKind, "active-task");
    assert.equal(parsed.target, "T1");
    assert.match(parsed.rationale, /active task|runtime/i);
    assert.match(parsed.nextAction ?? "", /\/continue/);
    assert.equal(parsed.recommendedCommand, "harness continue");
    assert.ok(parsed.alternatives.length > 0);
    assert.ok(["high", "medium", "low"].includes(parsed.urgency));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pickup-json reports blocked-state recommendations explicitly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-pickup-blocked-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI pickup blocked demo", true);
    await runtime.blockCurrentTask("waiting on schema");

    const output = await runCli(cwd, "pickup", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      pickupKind: string;
      recommendedCommand: string;
      alternatives: string[];
      urgency: string;
    };

    assert.equal(parsed.pickupKind, "blocked");
    assert.equal(parsed.recommendedCommand, "harness blocked --json");
    assert.ok(parsed.alternatives.includes("harness unblock"));
    assert.equal(parsed.urgency, "high");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pickup-json reports waiting-state recommendations explicitly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-pickup-waiting-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI pickup waiting demo", true);
    const taskState = runtime.getTaskStateSnapshot();
    taskState.activeTaskId = null;
    taskState.tasks.T1 = "todo";
    taskState.taskDependencies.T1 = ["T2"];
    taskState.tasks.T2 = "blocked";
    taskState.taskBlockers.T2 = "dependency pending";
    const { saveTaskState } = await import("../packages/harness-runtime/src/state/task-state.js");
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);
    const { createInitialRunState } = await import("../packages/harness-runtime/src/runtime/harness-runtime.js");
    const { loadRunState, saveRunState } = await import("../packages/harness-runtime/src/state/run-state.js");
    const runStatePath = join(cwd, ".harness", "state", "run-state.json");
    const runState = await loadRunState(runStatePath, createInitialRunState());
    await saveRunState(runStatePath, {
      ...runState,
      activeTaskId: null
    });

    const output = await runCli(cwd, "pickup", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      pickupKind: string;
      recommendedCommand: string;
      alternatives: string[];
      urgency: string;
    };

    assert.equal(parsed.pickupKind, "waiting");
    assert.equal(parsed.recommendedCommand, "harness status dashboard --json");
    assert.ok(parsed.alternatives.includes("harness blocked --json"));
    assert.equal(parsed.urgency, "low");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pickup-json reports idle-state recommendations explicitly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-pickup-idle-"));
  try {
    const output = await runCli(cwd, "pickup", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      pickupKind: string;
      recommendedCommand: string;
      alternatives: string[];
      urgency: string;
    };

    assert.equal(parsed.pickupKind, "idle");
    assert.equal(parsed.recommendedCommand, "harness auto <goal>");
    assert.ok(parsed.alternatives.includes("harness plan <goal>"));
    assert.equal(parsed.urgency, "low");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts related json reports active-task related artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-related-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI related artifacts demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await runCli(cwd, "artifacts", "related", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      targetTaskId: string | null;
      items: Array<{ type: string; path: string; relevance: string }>;
      groups: Array<{ label: string; items: Array<{ path: string }> }>;
    };

    assert.equal(parsed.mode, "related");
    assert.equal(parsed.targetTaskId, "T1");
    assert.ok(parsed.items.some(item => item.type === "task-output" && item.relevance === "exact"));
    assert.ok(parsed.items.some(item => item.type === "verification"));
    assert.ok(parsed.groups.some(group => group.label === "exact"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts related <taskId> --json stays machine-readable on the CLI path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-related-explicit-task-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI explicit related artifacts demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await runCli(cwd, "artifacts", "related", "T1", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      targetTaskId: string | null;
      items: Array<{ path: string }>;
    };

    assert.equal(parsed.mode, "related");
    assert.equal(parsed.targetTaskId, "T1");
    assert.ok(parsed.items.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts related for a non-active task marks session artifacts as supporting", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-related-supporting-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI related supporting demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const taskState = runtime.getTaskStateSnapshot();
    taskState.taskTexts.T9 = "Older task";
    taskState.taskOutputs.T9 = join(cwd, ".harness", "artifacts", "legacy-output.md");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(taskState.taskOutputs.T9, "legacy output\n", "utf8");
    const { saveTaskState } = await import("../packages/harness-runtime/src/state/task-state.js");
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);

    const output = await runCli(cwd, "artifacts", "related", "T9", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      targetTaskId: string | null;
      items: Array<{ type: string; relevance: string }>;
      groups: Array<{ label: string }>;
    };

    assert.equal(parsed.mode, "related");
    assert.equal(parsed.targetTaskId, "T9");
    assert.ok(parsed.items.some(item => item.type === "task-output" && item.relevance === "exact"));
    assert.ok(parsed.items.some(item => item.type === "verification" && item.relevance === "supporting"));
    assert.ok(parsed.groups.some(group => group.label === "supporting"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts related for a non-active task uses persisted task-bound provenance when present", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-related-exact-provenance-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI related exact provenance demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const taskState = runtime.getTaskStateSnapshot();
    taskState.taskTexts.T9 = "Older task";
    taskState.taskOutputs.T9 = join(cwd, ".harness", "artifacts", "legacy-output.md");
    taskState.taskVerificationPaths.T9 = join(cwd, ".harness", "artifacts", "verifications", "legacy-verification.md");
    taskState.taskReviewPaths.T9 = join(cwd, ".harness", "artifacts", "reviews", "legacy-review.md");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(cwd, ".harness", "artifacts", "verifications"), { recursive: true });
    await mkdir(join(cwd, ".harness", "artifacts", "reviews"), { recursive: true });
    await writeFile(taskState.taskOutputs.T9, "legacy output\n", "utf8");
    await writeFile(taskState.taskVerificationPaths.T9, "legacy verification\n", "utf8");
    await writeFile(taskState.taskReviewPaths.T9, "legacy review\n", "utf8");
    const { saveTaskState } = await import("../packages/harness-runtime/src/state/task-state.js");
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);

    const output = await runCli(cwd, "artifacts", "related", "T9", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      items: Array<{ type: string; path: string; relevance: string }>;
      groups: Array<{ label: string }>;
    };

    assert.ok(parsed.items.some(item => item.type === "verification" && item.path.endsWith("legacy-verification.md") && item.relevance === "exact"));
    assert.ok(parsed.items.some(item => item.type === "review" && item.path.endsWith("legacy-review.md") && item.relevance === "exact"));
    assert.ok(parsed.groups.some(group => group.label === "exact"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("artifacts related still uses persisted task-bound provenance after session latest pointers are cleared", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-related-provenance-fallback-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI related provenance fallback demo", true);

    const taskState = runtime.getTaskStateSnapshot();
    taskState.taskTexts.T9 = "Older task";
    taskState.taskVerificationPaths.T9 = join(cwd, ".harness", "artifacts", "verifications", "legacy-verification.md");
    taskState.taskReviewPaths.T9 = join(cwd, ".harness", "artifacts", "reviews", "legacy-review.md");
    taskState.taskHandoffPaths.T9 = join(cwd, ".harness", "artifacts", "handoffs", "legacy-handoff.md");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(cwd, ".harness", "artifacts", "verifications"), { recursive: true });
    await mkdir(join(cwd, ".harness", "artifacts", "reviews"), { recursive: true });
    await mkdir(join(cwd, ".harness", "artifacts", "handoffs"), { recursive: true });
    await writeFile(taskState.taskVerificationPaths.T9, "legacy verification\n", "utf8");
    await writeFile(taskState.taskReviewPaths.T9, "legacy review\n", "utf8");
    await writeFile(taskState.taskHandoffPaths.T9, "legacy handoff\n", "utf8");
    taskState.lastVerificationPath = null;
    taskState.lastReviewPath = null;
    taskState.lastHandoffPath = null;
    const { saveTaskState } = await import("../packages/harness-runtime/src/state/task-state.js");
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);

    const { saveRunState } = await import("../packages/harness-runtime/src/state/run-state.js");
    await saveRunState(
      join(cwd, ".harness", "state", "run-state.json"),
      {
        phase: "paused",
        currentFlow: "auto",
        goalSummary: "fallback demo",
        activeSpecPath: null,
        activePlanPath: null,
        activeMilestoneId: null,
        activeTaskId: null,
        lastVerificationStatus: null,
        lastVerificationPath: null,
        lastReviewPath: null,
        lastHandoffPath: null,
        pendingQuestions: [],
        blocker: null,
        updatedAt: new Date().toISOString()
      }
    );

    const output = await runCli(cwd, "artifacts", "related", "T9", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      items: Array<{ type: string; path: string; relevance: string }>;
    };

    assert.ok(parsed.items.some(item => item.type === "verification" && item.path.endsWith("legacy-verification.md") && item.relevance === "exact"));
    assert.ok(parsed.items.some(item => item.type === "review" && item.path.endsWith("legacy-review.md") && item.relevance === "exact"));
    assert.ok(parsed.items.some(item => item.type === "handoff" && item.path.endsWith("legacy-handoff.md") && item.relevance === "exact"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("timeline-json reports runtime and artifact timeline events", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-timeline-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI timeline demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.createHandoff();

    const output = await runCli(cwd, "timeline", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      items: Array<{ kind: string; label: string }>;
      recovery: {
        latestFailurePath: string | null;
        latestPassPath: string | null;
        latestReviewPath: string | null;
        latestHandoffPath: string | null;
        blocker: string | null;
        recoveryHint: string | null;
        recommendation: string | null;
      };
    };

    assert.equal(parsed.mode, "timeline");
    assert.ok(parsed.items.some(item => item.kind === "runtime"));
    assert.ok(parsed.items.some(item => item.kind === "artifact"));
    assert.ok(parsed.recovery.latestPassPath === null || parsed.recovery.latestPassPath.includes("/verifications/"));
    assert.ok(parsed.recovery.latestHandoffPath === null || parsed.recovery.latestHandoffPath.includes("/handoffs/"));
    assert.equal(parsed.recovery.blocker, null);
    assert.equal(parsed.recovery.recoveryHint, null);
    assert.ok(typeof parsed.recovery.recommendation === "string" || parsed.recovery.recommendation === null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("timeline-json exposes blocker and recovery hint when runtime is paused on failure", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-timeline-recovery-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI timeline recovery demo", true);
    await runtime.advanceMilestone();
    const taskState = runtime.getTaskStateSnapshot();
    taskState.taskVerificationCommands.T2 = ["node -e \"process.exit(1)\""];
    taskState.taskDependencies.T2 = [];
    const { saveTaskState } = await import("../packages/harness-runtime/src/state/task-state.js");
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);
    const refreshed = await HarnessRuntime.create(cwd);
    await refreshed.executeCurrentTask();
    await refreshed.verify();

    const output = await runCli(cwd, "timeline", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      recovery: {
        latestFailurePath: string | null;
        blocker: string | null;
        recoveryHint: string | null;
      };
    };

    assert.ok(parsed.recovery.latestFailurePath?.includes("/verifications/"));
    assert.ok(parsed.recovery.blocker);
    assert.equal(parsed.recovery.recoveryHint, "implementation_fix_required");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("recent-json rejects invalid artifact filters instead of broadening scope", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-recent-invalid-filter-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI recent invalid filter demo", true);

    const output = await runCli(cwd, "recent", "bad-filter", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as { error: string };

    assert.match(parsed.error, /Unknown artifact filter/i);
    assert.match(parsed.error, /bad-filter/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("handoff-json returns a machine-readable handoff artifact path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-handoff-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI handoff json demo", true);

    const output = await runCli(cwd, "/handoff-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      path: string;
      status: { phase: string; activeTaskId: string | null };
    };

    assert.match(parsed.path, /handoffs\/.+\.md$/);
    assert.equal(parsed.status.phase, "planning");
    assert.equal(parsed.status.activeTaskId, "T1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("handoff inspect json exposes latest handoff preview and cleanup recommendation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-handoff-inspect-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI handoff inspect demo", true);
    const handoffPath = await runtime.createHandoff();

    const output = await runCli(cwd, "handoff", "inspect", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      path: string | null;
      preview: string[];
      cleanupEligible: boolean;
      cleanupRecommendation: string;
    };

    assert.equal(parsed.mode, "handoff-inspect");
    assert.equal(parsed.path, handoffPath);
    assert.ok(parsed.preview.length > 0);
    assert.equal(parsed.cleanupEligible, false);
    assert.match(parsed.cleanupRecommendation, /active|Keep/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("handoff cleanup json clears preserved handoff pointers in safe states", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-handoff-cleanup-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI handoff cleanup demo", true);
    const handoffPath = await runtime.createHandoff();
    await runtime.reset();

    const output = await runCli(cwd, "handoff", "cleanup", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      cleared: boolean;
      previousPath: string | null;
      remainingPath: string | null;
      status: { lastHandoffPath: string | null; phase: string };
    };

    assert.equal(parsed.mode, "handoff-cleanup");
    assert.equal(parsed.cleared, true);
    assert.equal(parsed.previousPath, handoffPath);
    assert.equal(parsed.remainingPath, null);
    assert.equal(parsed.status.lastHandoffPath, null);
    assert.equal(parsed.status.phase, "idle");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("handoff cleanup json refuses to clear preserved handoff while runtime is active", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-handoff-cleanup-active-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI handoff cleanup active demo", true);
    const handoffPath = await runtime.createHandoff();

    const output = await runCli(cwd, "handoff", "cleanup", "--json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      mode: string;
      cleared: boolean;
      previousPath: string | null;
      remainingPath: string | null;
      reason: string;
      status: { lastHandoffPath: string | null; phase: string };
    };

    assert.equal(parsed.mode, "handoff-cleanup");
    assert.equal(parsed.cleared, false);
    assert.equal(parsed.previousPath, handoffPath);
    assert.equal(parsed.remainingPath, handoffPath);
    assert.match(parsed.reason, /inactive/i);
    assert.equal(parsed.status.lastHandoffPath, handoffPath);
    assert.equal(parsed.status.phase, "planning");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("execute-json returns a machine-readable active task id", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-execute-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI execute json demo", true);

    const output = await runCli(cwd, "/execute-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      taskId: string;
      status: { activeTaskId: string | null };
    };

    assert.equal(parsed.taskId, "T1");
    assert.equal(parsed.status.activeTaskId, "T1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("continue-json returns a machine-readable continuation result", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-continue-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI continue json demo", true);

    const output = await runCli(cwd, "/continue-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      result: string;
      status: { phase: string; activeTaskId: string | null };
    };

    assert.match(parsed.result, /moved to in_progress/);
    assert.equal(parsed.status.phase, "implementing");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("advance-json returns a machine-readable advance result", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-advance-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI advance json demo", true);

    const output = await runCli(cwd, "/advance-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      result: string;
      status: { activeMilestoneId: string | null; activeTaskId: string | null };
    };

    assert.match(parsed.result, /M1 completed; M2 is now active/);
    assert.equal(parsed.status.activeMilestoneId, "M2");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("block-json, unblock-json, resume-json, and reset-json are machine-readable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-state-actions-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI state action json demo", true);
    await runtime.executeCurrentTask();

    const blockOutput = await runCli(cwd, "/block-json", "waiting on API schema");
    const blockParsed = JSON.parse(extractJsonPayload(blockOutput)) as {
      result: string;
      status: { phase: string; blocker: string | null };
    };
    assert.match(blockParsed.result, /blocked/);
    assert.equal(blockParsed.status.phase, "paused");

    const unblockOutput = await runCli(cwd, "/unblock-json");
    const unblockParsed = JSON.parse(extractJsonPayload(unblockOutput)) as {
      result: string;
      status: { blocker: string | null };
    };
    assert.match(unblockParsed.result, /ready to continue/);
    assert.equal(unblockParsed.status.blocker, null);

    const resumeOutput = await runCli(cwd, "/resume-json");
    const resumeParsed = JSON.parse(extractJsonPayload(resumeOutput)) as {
      phase: string;
      status: { phase: string };
    };
    assert.ok(["implementing", "planning", "reviewing", "paused", "completed", "idle"].includes(resumeParsed.phase));
    assert.equal(resumeParsed.status.phase, resumeParsed.phase);

    const handoffOutput = await runCli(cwd, "/handoff-json");
    const handoffParsed = JSON.parse(extractJsonPayload(handoffOutput)) as { path: string };
    assert.match(handoffParsed.path, /handoffs\/.+\.md$/);

    const resetOutput = await runCli(cwd, "/reset-json");
    const resetParsed = JSON.parse(extractJsonPayload(resetOutput)) as {
      result: string;
      status: { phase: string };
    };
    assert.match(resetParsed.result, /Session reset/);
    assert.equal(resetParsed.status.phase, "idle");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
