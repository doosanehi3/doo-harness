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
      commandGroups: Array<{ title: string; commands: string[] }>;
    };

    assert.match(parsed.overview, /pi-ready runtime-core product/i);
    assert.ok(parsed.commandGroups.some(group => group.title === "Operator Loop"));
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
      tools: Array<{ name: string }>;
    };
    assert.equal(doctor.mode, "doctor");
    assert.ok(doctor.tools.some(item => item.name === "node"));

    const bootstrapOutput = await bridge.execute("bootstrap --json");
    const bootstrap = JSON.parse(bootstrapOutput) as {
      mode: string;
      presets: Array<{ id: string }>;
    };
    assert.equal(bootstrap.mode, "bootstrap");
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
    };

    assert.equal(parsed.mode, "dashboard");
    assert.ok(parsed.blocked.items.length > 0);
    assert.equal(parsed.pickup.pickupKind, "blocked");
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
      items: Array<{ taskId: string }>;
    };
    assert.equal(blocked.mode, "blocked");
    assert.ok(blocked.items.some(item => item.taskId === "T1"));

    await runtime.unblockCurrentTask();
    await runtime.executeCurrentTask();
    await runtime.verify();

    const queueOutput = await bridge.execute("queue review --json");
    const queue = JSON.parse(queueOutput) as {
      mode: string;
      items: Array<{ label: string }>;
    };
    assert.equal(queue.mode, "queue");
    assert.ok(queue.items.length > 0);

    const pickupOutput = await bridge.execute("pickup --json");
    const pickup = JSON.parse(pickupOutput) as {
      mode: string;
      pickupKind: string;
    };
    assert.equal(pickup.mode, "pickup");
    assert.ok(["active-task", "blocked", "ready-task", "waiting", "idle"].includes(pickup.pickupKind));
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
    };
    assert.equal(timeline.mode, "timeline");
    assert.ok(timeline.items.some(item => item.kind === "runtime"));
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
