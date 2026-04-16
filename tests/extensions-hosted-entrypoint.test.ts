import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createPiHostedHarnessBridge } from "../packages/extensions/src/index.js";

const execFileAsync = promisify(execFile);

async function createTempHarnessDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "doo-harness-extension-host-"));
}

test("pi-hosted bridge returns machine-readable help payload", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const output = await bridge.execute("/help-json");
    const parsed = JSON.parse(output) as {
      overview: string;
      contextual: { focus: string; commands: string[] };
      commandGroups: Array<{ title: string; commands: string[] }>;
    };

    assert.match(parsed.overview, /pi-ready runtime-core product/i);
    assert.ok(parsed.contextual.focus.length > 0);
    assert.ok(parsed.contextual.commands.length > 0);
    assert.ok(parsed.commandGroups.some(group => group.title === "Operator Loop"));

    const runtime = await bridge.getRuntime();
    await runtime.plan("Hosted help preserved handoff demo", true);
    await runtime.createHandoff();
    await runtime.reset();
    const handoffHelpOutput = await bridge.execute("/help-json");
    const handoffHelp = JSON.parse(handoffHelpOutput) as {
      contextual: { focus: string; commands: string[] };
    };
    assert.equal(handoffHelp.contextual.focus, "preserved-handoff");
    assert.ok(handoffHelp.contextual.commands.includes("harness handoff inspect --json"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge exposes doctor and bootstrap onboarding surfaces", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });

    const doctorOutput = await bridge.execute("doctor --json");
    const doctor = JSON.parse(doctorOutput) as {
      mode: string;
      tools: Array<{ name: string; installCommand: string }>;
      recommendedCommand: string;
      firstRunCommands: string[];
      validationTracks: Array<{ kind: string; commands: string[] }>;
    };
    assert.equal(doctor.mode, "doctor");
    assert.ok(doctor.tools.some(item => item.name === "node"));
    assert.ok(doctor.tools.every(item => item.installCommand.length > 0));
    assert.ok(doctor.recommendedCommand.length > 0);
    assert.ok(doctor.firstRunCommands.length > 0);
    assert.ok(doctor.validationTracks.some(track => track.kind === "local"));
    assert.ok(doctor.validationTracks.some(track => track.kind === "interactive"));
    assert.ok(doctor.validationTracks.some(track => track.kind === "release"));

    const bootstrapOutput = await bridge.execute("bootstrap --json");
    const bootstrap = JSON.parse(bootstrapOutput) as {
      mode: string;
      recommendedPreset: string;
      nextCommands: string[];
      presets: Array<{ id: string }>;
    };
    assert.equal(bootstrap.mode, "bootstrap");
    assert.ok(bootstrap.recommendedPreset.length > 0);
    assert.ok(bootstrap.nextCommands.length > 0);
    assert.ok(bootstrap.presets.some(item => item.id === "node-cli"));

    const invalidBootstrapOutput = await bridge.execute("bootstrap nope --json");
    const invalidBootstrap = JSON.parse(invalidBootstrapOutput) as { error: string };
    assert.match(invalidBootstrap.error, /Unknown bootstrap preset/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge can plan and expose runtime status", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd, allowedTools: ["read"] });
    const planOutput = await bridge.execute("/plan-json Extension-hosted planning demo");
    const planned = JSON.parse(planOutput) as {
      planPath: string;
      status: { phase: string; activeTaskId: string | null };
    };

    assert.match(planned.planPath, /plan\.md$/);
    assert.equal(planned.status.phase, "planning");
    assert.equal(planned.status.activeTaskId, "T1");

    const statusOutput = await bridge.execute("/status-json");
    const status = JSON.parse(statusOutput) as {
      allowedTools: string[];
      handoffEligible: boolean;
    };

    assert.deepEqual(status.allowedTools, ["read"]);
    assert.equal(status.handoffEligible, true);

    const lanesOutput = await bridge.execute("status lanes --json");
    const lanes = JSON.parse(lanesOutput) as {
      mode: string;
      active: { taskId: string | null; owner: string | null };
      ready: Array<{ taskId: string }>;
    };
    assert.equal(lanes.mode, "lanes");
    assert.equal(lanes.active.taskId, "T1");
    assert.equal(lanes.active.owner, "planner");
    assert.ok(lanes.ready.length > 0);

    const readinessOutput = await bridge.execute("status readiness --json");
    const readiness = JSON.parse(readinessOutput) as {
      mode: string;
      recommendedCommand: string;
      validationTracks: Array<{ kind: string }>;
    };
    assert.equal(readiness.mode, "readiness");
    assert.ok(readiness.recommendedCommand.length > 0);
    assert.ok(readiness.validationTracks.some(track => track.kind === "release"));

    const shipOutput = await bridge.execute("status ship --json");
    const ship = JSON.parse(shipOutput) as {
      mode: string;
      recommendedCommand: string;
      releaseChecks: string[];
    };
    assert.equal(ship.mode, "ship");
    assert.ok(ship.recommendedCommand.length > 0);
    assert.ok(ship.releaseChecks.length > 0);

    const todayOutput = await bridge.execute("status today --json");
    const today = JSON.parse(todayOutput) as {
      mode: string;
      activeLane: { taskId: string | null };
      readinessRecommendedCommand: string;
      shipRecommendedCommand: string;
    };
    assert.equal(today.mode, "today");
    assert.equal(today.activeLane.taskId, "T1");
    assert.ok(today.readinessRecommendedCommand.length > 0);
    assert.ok(today.shipRecommendedCommand.length > 0);

    const handoffOutput = await bridge.execute("handoff --json");
    const handoff = JSON.parse(handoffOutput) as {
      path: string;
      status: { phase: string; activeTaskId: string | null };
    };
    assert.match(handoff.path, /handoffs\/.+\.md$/);
    assert.equal(handoff.status.activeTaskId, "T1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge exposes autonomous auto entrypoint", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });

    const output = await bridge.execute("auto --json --steps 0 Hosted auto demo");
    const parsed = JSON.parse(output) as {
      mode: string;
      entry: string;
      startedNewPlan: boolean;
      specPath: string | null;
      stopReason: string;
    };

    assert.equal(parsed.mode, "auto");
    assert.equal(parsed.entry, "planned");
    assert.equal(parsed.startedNewPlan, true);
    assert.match(parsed.specPath ?? "", /spec\.md$/);
    assert.equal(parsed.stopReason, "max_steps");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge exposes handoff inspect and cleanup entrypoints", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Hosted handoff inspect demo", true);
    const handoffPath = await runtime.createHandoff();

    const inspectOutput = await bridge.execute("handoff inspect --json");
    const inspect = JSON.parse(inspectOutput) as {
      mode: string;
      path: string | null;
      preview: string[];
    };
    assert.equal(inspect.mode, "handoff-inspect");
    assert.equal(inspect.path, handoffPath);
    assert.ok(inspect.preview.length > 0);

    await runtime.reset();
    const cleanupOutput = await bridge.execute("handoff cleanup --json");
    const cleanup = JSON.parse(cleanupOutput) as {
      mode: string;
      cleared: boolean;
      status: { lastHandoffPath: string | null };
    };
    assert.equal(cleanup.mode, "handoff-cleanup");
    assert.equal(cleanup.cleared, true);
    assert.equal(cleanup.status.lastHandoffPath, null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge keeps preserved handoff when cleanup is attempted during active runtime", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Hosted handoff cleanup active demo", true);
    const handoffPath = await runtime.createHandoff();

    const cleanupOutput = await bridge.execute("handoff cleanup --json");
    const cleanup = JSON.parse(cleanupOutput) as {
      mode: string;
      cleared: boolean;
      previousPath: string | null;
      remainingPath: string | null;
      reason: string;
      status: { lastHandoffPath: string | null; phase: string };
    };
    assert.equal(cleanup.mode, "handoff-cleanup");
    assert.equal(cleanup.cleared, false);
    assert.equal(cleanup.previousPath, handoffPath);
    assert.equal(cleanup.remainingPath, handoffPath);
    assert.match(cleanup.reason, /inactive/i);
    assert.equal(cleanup.status.lastHandoffPath, handoffPath);
    assert.equal(cleanup.status.phase, "planning");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge exposes review and search surfaces", async () => {
  const cwd = await createTempHarnessDir();
  try {
    await writeFile(join(cwd, "catalog-review.md"), "catalog review target\n", "utf8");

    const bridge = createPiHostedHarnessBridge({ cwd });
    await bridge.execute("/plan-json Extension-hosted review demo");
    const runtime = await bridge.getRuntime();
    await runtime.executeCurrentTask();
    await runtime.verify();

    const reviewOutput = await bridge.execute("review deep --json");
    const review = JSON.parse(reviewOutput) as {
      mode: string;
      path: string;
      preview: string[];
      history: string[];
      status: { phase: string };
    };

    assert.equal(review.mode, "deep");
    assert.match(review.path, /reviews\/.+\.md$/);
    assert.ok(review.preview.length > 0);
    assert.ok(Array.isArray(review.history));
    assert.ok(["paused", "completed"].includes(review.status.phase));

    const searchOutput = await bridge.execute("/recent-json review");
    const search = JSON.parse(searchOutput) as {
      mode: string;
      matches: string[];
    };

    assert.equal(search.mode, "recent");
    assert.ok(search.matches.some(line => line.includes("/reviews/")));

    const activeTaskOutput = await bridge.execute("recent active-task --json");
    const activeTask = JSON.parse(activeTaskOutput) as {
      mode: string;
      query: string;
      matches: string[];
    };
    assert.equal(activeTask.mode, "recent");
    assert.equal(activeTask.query, "active-task");
    assert.ok(activeTask.matches.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge exposes review history and review artifact surfaces", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Hosted review history demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();
    await runtime.review();

    const historyOutput = await bridge.execute("review history --json");
    const history = JSON.parse(historyOutput) as {
      mode: string;
      history: string[];
    };
    assert.equal(history.mode, "history");
    assert.ok(history.history.length > 0);

    const artifactOutput = await bridge.execute("review artifact verification --json");
    const artifact = JSON.parse(artifactOutput) as {
      mode: string;
      target: string;
      preview: string[];
    };
    assert.equal(artifact.mode, "artifact");
    assert.equal(artifact.target, "artifact:verification");
    assert.ok(artifact.preview.length > 0);

    const compareOutput = await bridge.execute("review compare --json");
    const compare = JSON.parse(compareOutput) as {
      mode: string;
      comparedRefs: string[];
      synthesis: string[];
    };
    assert.equal(compare.mode, "compare");
    assert.ok(compare.comparedRefs.length >= 2);
    assert.ok(compare.synthesis.some(line => line.startsWith("Compared refs:")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge keeps targeted review diff json aligned with the CLI surface", async () => {
  const cwd = await createTempHarnessDir();
  try {
    await execFileAsync("git", ["init"], { cwd });
    await writeFile(join(cwd, "target-a.md"), "# target a\n", "utf8");
    await writeFile(join(cwd, "target-a.md.bak"), "# target a backup\n", "utf8");

    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Hosted review diff target demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await bridge.execute("review diff target-a.md --json");
    const parsed = JSON.parse(output) as {
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

test("pi-hosted bridge exposes compact status", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    await bridge.execute("/plan-json Extension-hosted compact status demo");

    const output = await bridge.execute("/status compact --json");
    const parsed = JSON.parse(output) as {
      compact: boolean;
      phase: string;
      activeTaskId: string | null;
      recentArtifacts: string[];
    };

    assert.equal(parsed.compact, true);
    assert.equal(parsed.phase, "planning");
    assert.equal(parsed.activeTaskId, "T1");
    assert.ok(Array.isArray(parsed.recentArtifacts));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge exposes dashboard status", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Hosted dashboard demo", true);
    await runtime.blockCurrentTask("waiting on API schema");

    const output = await bridge.execute("status dashboard --json");
    const parsed = JSON.parse(output) as {
      mode: string;
      blocked: { items: unknown[] };
      pickup: { pickupKind: string };
      handoff: { eligible: boolean };
      auto: { recommendedCommand: string };
    };

    assert.equal(parsed.mode, "dashboard");
    assert.ok(parsed.blocked.items.length > 0);
    assert.equal(parsed.pickup.pickupKind, "blocked");
    assert.equal(typeof parsed.handoff.eligible, "boolean");
    assert.ok(parsed.auto.recommendedCommand.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge reports invalid artifact filters explicitly", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });

    const artifactsOutput = await bridge.execute("artifacts not-a-real-type --json");
    const artifactsParsed = JSON.parse(artifactsOutput) as { error: string };
    assert.match(artifactsParsed.error, /Unknown artifact filter/);

    const recentOutput = await bridge.execute("recent bad-filter --json");
    const recentParsed = JSON.parse(recentOutput) as { error: string };
    assert.match(recentParsed.error, /Unknown artifact filter/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge exposes blocked, queue, and pickup entrypoints", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Hosted entrypoint wave demo", true);
    await runtime.blockCurrentTask("waiting on API schema");

    const blockedOutput = await bridge.execute("blocked --json");
    const blocked = JSON.parse(blockedOutput) as {
      mode: string;
      items: Array<{ taskId: string; recoveryRecommendation: string }>;
    };
    assert.equal(blocked.mode, "blocked");
    assert.ok(blocked.items.some(item => item.taskId === "T1"));
    assert.ok(blocked.items.some(item => item.recoveryRecommendation.length > 0));

    await runtime.unblockCurrentTask();
    await runtime.executeCurrentTask();
    await runtime.verify();

    const queueOutput = await bridge.execute("queue review --json");
    const queue = JSON.parse(queueOutput) as {
      mode: string;
      items: Array<{ label: string; priority: string; rationale: string; score: number; recommendedCommand: string }>;
    };
    assert.equal(queue.mode, "queue");
    assert.ok(queue.items.length > 0);
    assert.ok(queue.items[0]?.priority);
    assert.ok(queue.items[0]?.rationale);
    assert.equal(typeof queue.items[0]?.score, "number");
    assert.ok(queue.items[0]?.recommendedCommand.length > 0);

    const pickupOutput = await bridge.execute("pickup --json");
    const pickup = JSON.parse(pickupOutput) as {
      mode: string;
      pickupKind: string;
      rationale: string;
      recommendedCommand: string;
      alternatives: string[];
      urgency: string;
    };
    assert.equal(pickup.mode, "pickup");
    assert.ok(["active-task", "blocked", "ready-task", "waiting", "idle"].includes(pickup.pickupKind));
    assert.ok(pickup.rationale.length > 0);
    assert.ok(pickup.recommendedCommand.length > 0);
    assert.ok(pickup.alternatives.length > 0);
    assert.ok(["high", "medium", "low"].includes(pickup.urgency));
    assert.ok(pickup.alternatives.some(item => item.includes("harness")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge exposes related artifacts and timeline entrypoints", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    const runtime = await bridge.getRuntime();
    await runtime.plan("Hosted timeline demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const relatedOutput = await bridge.execute("artifacts related --json");
    const related = JSON.parse(relatedOutput) as {
      mode: string;
      items: Array<{ type: string; relevance: string }>;
      groups: Array<{ label: string }>;
    };
    assert.equal(related.mode, "related");
    assert.ok(related.items.some(item => item.type === "verification"));
    assert.ok(related.groups.some(item => item.label === "exact"));

    const timelineOutput = await bridge.execute("timeline --json");
    const timeline = JSON.parse(timelineOutput) as {
      mode: string;
      items: Array<{ kind: string }>;
      recovery: { recommendation: string | null; blocker: string | null; recoveryHint: string | null };
    };
    assert.equal(timeline.mode, "timeline");
    assert.ok(timeline.items.some(item => item.kind === "runtime"));
    assert.ok(typeof timeline.recovery.recommendation === "string" || timeline.recovery.recommendation === null);
    assert.ok("blocker" in timeline.recovery);
    assert.ok("recoveryHint" in timeline.recovery);

    const inspectOutput = await bridge.execute("artifacts inspect --json");
    const inspect = JSON.parse(inspectOutput) as {
      mode: string;
      artifact: { path: string; type: string };
      preview: string[];
    };
    assert.equal(inspect.mode, "artifact-inspect");
    assert.ok(inspect.artifact.path.length > 0);
    assert.ok(inspect.preview.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("pi-hosted bridge accepts slash-form compact status and rejects invalid artifact filters", async () => {
  const cwd = await createTempHarnessDir();
  try {
    const bridge = createPiHostedHarnessBridge({ cwd });
    await bridge.execute("/plan-json Extension-hosted slash compact demo");

    const statusOutput = await bridge.execute("/status compact --json");
    const status = JSON.parse(statusOutput) as {
      compact: boolean;
      phase: string;
    };
    assert.equal(status.compact, true);
    assert.equal(status.phase, "planning");

    const artifactsOutput = await bridge.execute("/artifacts-json nope");
    const artifacts = JSON.parse(artifactsOutput) as { error: string };
    assert.match(artifacts.error, /Unknown artifact filter/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
