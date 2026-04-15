import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiHostedHarnessBridge } from "../packages/extensions/src/index.js";

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

    const reviewOutput = await bridge.execute("/review-json");
    const review = JSON.parse(reviewOutput) as {
      path: string;
      preview: string[];
      status: { phase: string };
    };

    assert.match(review.path, /reviews\/.+\.md$/);
    assert.ok(review.preview.length > 0);
    assert.ok(["paused", "completed"].includes(review.status.phase));

    const searchOutput = await bridge.execute("/find-json review");
    const search = JSON.parse(searchOutput) as {
      mode: string;
      matches: string[];
    };

    assert.equal(search.mode, "find");
    assert.ok(search.matches.some(line => line.includes("catalog-review.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
