import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
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
    };

    assert.equal(parsed.phase, "planning");
    assert.equal(parsed.flow, "milestone");
    assert.equal(parsed.activeTaskId, "T1");
    assert.equal(parsed.activeTaskRecoveryHint, null);
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
      commandGroups: Array<{ title: string; commands: string[] }>;
    };

    assert.match(parsed.overview, /artifact-led state/i);
    assert.ok(parsed.quickStart.some(line => line.includes("config init")));
    assert.ok(parsed.commandGroups.some(group => group.title === "Provider"));
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

test("review-json returns a machine-readable review artifact path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-cli-review-"));
  try {
    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("CLI review json demo", true);
    await runtime.executeCurrentTask();
    await runtime.verify();

    const output = await runCli(cwd, "/review-json");
    const parsed = JSON.parse(extractJsonPayload(output)) as {
      path: string;
      status: { phase: string; activeTaskId: string | null };
    };

    assert.match(parsed.path, /reviews\/.+\.md$/);
    assert.equal(parsed.status.phase, "paused");
    assert.equal(parsed.status.activeTaskId, "T1");
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
