import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessRuntime } from "../packages/harness-runtime/src/runtime/harness-runtime.js";
import {
  createOpenAICodexRuntimeConfig,
  writeDefaultRuntimeConfig
} from "../packages/harness-runtime/src/config/runtime-config.js";

test("workspace ai and agent-core packages resolve from source during local development", async () => {
  const aiPackage = JSON.parse(await readFile(join(process.cwd(), "packages", "ai", "package.json"), "utf8")) as {
    main: string;
    types: string;
  };
  const agentCorePackage = JSON.parse(await readFile(join(process.cwd(), "packages", "agent-core", "package.json"), "utf8")) as {
    main: string;
    types: string;
  };

  assert.equal(aiPackage.main, "./src/index.ts");
  assert.equal(aiPackage.types, "./src/index.ts");
  assert.equal(agentCorePackage.main, "./src/index.ts");
  assert.equal(agentCorePackage.types, "./src/index.ts");
});

test("runtime loads role-specific model ids from config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            default: "default-model",
            planner: "planner-model",
            worker: "worker-model",
            validator: "validator-model"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Configured model selection", true);
    let status = runtime.getStatus();
    assert.equal(status.activeModelId, "planner-model");

    await runtime.advanceMilestone();
    status = runtime.getStatus();
    assert.equal(status.activeModelId, "worker-model");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runtime accepts object-form model config entries", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-object-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            default: {
              id: "custom-default",
              provider: "openai",
              name: "Custom Default",
              reasoning: true
            },
            planner: {
              id: "custom-planner",
              provider: "openai",
              name: "Custom Planner",
              reasoning: true
            }
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Configured object model selection", true);
    const status = runtime.getStatus();

    assert.equal(status.activeModelId, "custom-planner");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runtime resolves workerMode from config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-worker-mode-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          execution: {
            workerMode: "fresh"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Configured worker mode", true);
    await runtime.advanceMilestone();
    await runtime.executeCurrentTask();
    const status = runtime.getStatus();

    assert.equal(status.activeModelId, "stub-worker");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runtime resolves subprocess workerMode from config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-worker-subprocess-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          execution: {
            workerMode: "subprocess"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Configured subprocess worker mode", true);
    await runtime.advanceMilestone();
    const status = runtime.getStatus();

    assert.equal(status.activeModelId, "stub-worker");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runtime resolves planner and validator execution modes from config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-role-modes-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          execution: {
            plannerMode: "subprocess",
            validatorMode: "subprocess"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Configured planner validator mode", true);
    let status = runtime.getStatus();
    assert.equal(status.activeExecutionMode, "subprocess");

    await runtime.executeCurrentTask();
    await runtime.verify();
    status = runtime.getStatus();
    assert.equal(status.activeExecutionMode, "subprocess");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runtime supports validator agent mode from config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-validator-agent-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          execution: {
            validatorMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Configured validator agent mode", true);
    await runtime.advanceMilestone();
    await runtime.advanceMilestone();
    const status = runtime.getStatus();

    assert.equal(status.activeExecutionMode, "agent");
    assert.equal(status.activeTaskOwner, "validator");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runtime exposes provider readiness for each role", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-provider-readiness-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            default: {
              id: "default-openai",
              provider: "openai-compatible",
              baseUrl: "https://example.test",
              apiPath: "/v1/chat/completions"
            },
            planner: {
              id: "planner-openrouter",
              provider: "openrouter"
            }
          },
          execution: {
            plannerMode: "subprocess",
            workerMode: "fresh",
            validatorMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    const readiness = runtime.getProviderReadiness();

    assert.equal(readiness.length, 4);
    assert.deepEqual(
      readiness.map(item => item.role),
      ["default", "planner", "worker", "validator"]
    );
    assert.equal(readiness[0]?.provider, "openai-compatible");
    assert.equal(readiness[0]?.authSource, "env");
    assert.equal(readiness[0]?.envVar, "OPENAI_API_KEY");
    assert.equal(readiness[0]?.credentialLocation, "OPENAI_API_KEY");
    assert.equal(readiness[0]?.status, "missing_credentials");
    assert.match(readiness[0]?.suggestedAction ?? "", /Set OPENAI_API_KEY/);
    assert.equal(readiness[0]?.baseUrl, "https://example.test");
    assert.equal(readiness[1]?.provider, "openrouter");
    assert.equal(readiness[1]?.envVar, "OPENROUTER_API_KEY");
    assert.equal(readiness[1]?.executionMode, "subprocess");
    assert.equal(readiness[2]?.executionMode, "fresh");
    assert.equal(readiness[3]?.executionMode, "agent");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("writeDefaultRuntimeConfig creates a default config file", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-init-"));
  try {
    const path = await writeDefaultRuntimeConfig(cwd);
    const body = await readFile(path, "utf8");

    assert.match(body, /"default": "stub"/);
    assert.match(body, /"planner": "stub-planner"/);
    assert.match(body, /"worker": "stub-worker"/);
    assert.match(body, /"validator": "stub-validator"/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("createOpenAICodexRuntimeConfig produces pi-auth codex models", () => {
  const config = createOpenAICodexRuntimeConfig();

  const defaultModel = config.models.default;
  if (typeof defaultModel === "string") {
    assert.fail("expected object-form model config");
  }

  assert.equal(defaultModel.provider, "openai-codex");
  assert.equal(defaultModel.authSource, "pi-auth");
  assert.equal(config.models.validator && typeof config.models.validator !== "string" ? config.models.validator.id : null, "gpt-5.3-codex-spark");
});

test("writeDefaultRuntimeConfig preserves an existing config by default", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-preserve-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    const path = join(cwd, ".harness", "config.json");
    await writeFile(
      path,
      JSON.stringify({ models: { default: "custom-model" } }, null, 2) + "\n",
      "utf8"
    );

    await writeDefaultRuntimeConfig(cwd);
    const body = await readFile(path, "utf8");

    assert.match(body, /"custom-model"/);
    assert.doesNotMatch(body, /"stub-planner"/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("writeDefaultRuntimeConfig can write the openai-codex profile", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-openai-codex-"));
  try {
    const path = await writeDefaultRuntimeConfig(cwd, true, "openai-codex");
    const body = await readFile(path, "utf8");

    assert.match(body, /"provider": "openai-codex"/);
    assert.match(body, /"authSource": "pi-auth"/);
    assert.match(body, /"gpt-5\.3-codex-spark"/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("writeDefaultRuntimeConfig overwrites an existing config when requested", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-config-overwrite-"));
  try {
    await mkdir(join(cwd, ".harness"), { recursive: true });
    const path = join(cwd, ".harness", "config.json");
    await writeFile(
      path,
      JSON.stringify({ models: { default: "custom-model" } }, null, 2) + "\n",
      "utf8"
    );

    await writeDefaultRuntimeConfig(cwd, true);
    const body = await readFile(path, "utf8");

    assert.match(body, /"default": "stub"/);
    assert.match(body, /"planner": "stub-planner"/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
