import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
