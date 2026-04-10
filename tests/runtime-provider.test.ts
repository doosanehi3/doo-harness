import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessRuntime } from "../packages/harness-runtime/src/runtime/harness-runtime.js";

const execFileAsync = promisify(execFile);

test("implementation task can use an openai-compatible worker model through the agent path", async () => {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: "tool:read sample.txt" } }]
      })
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            worker: {
              id: "gpt-test",
              provider: "openai-compatible",
              name: "gpt-test",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/chat/completions",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
          execution: {
            workerMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(join(cwd, "sample.txt"), "provider-backed read", "utf8");

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Provider-backed worker demo", true);
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
    const taskState = runtime.getTaskStateSnapshot();
    const note = await readFile(taskState.taskOutputs[taskId], "utf8");
    const status = runtime.getStatus();

    assert.equal(taskId, "T2");
    assert.equal(status.activeModelId, "gpt-test");
    assert.equal(status.activeModelTemperature, null);
    assert.equal(status.activeModelMaxTokens, null);
    assert.equal(status.activeExecutionMode, "agent");
    assert.match(note, /provider-backed read/);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("implementation task blocks when agent-mode provider produces no concrete file changes", async () => {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "done" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-nochange-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            worker: {
              id: "gpt-test",
              provider: "openai-compatible",
              name: "gpt-test",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/chat/completions",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
          execution: {
            workerMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Provider-backed no-change worker demo", true);
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
    const taskState = runtime.getTaskStateSnapshot();
    const status = runtime.getStatus();
    const note = await readFile(taskState.taskOutputs[taskId], "utf8");

    assert.equal(taskId, "T2");
    assert.equal(status.phase, "paused");
    assert.equal(status.activeTaskStatus, "blocked");
    assert.equal(status.activeTaskRecoveryHint, "implementation_no_changes");
    assert.match(status.blocker ?? "", /no concrete file changes/i);
    assert.match(note, /## Changed Files/);
    assert.match(note, /- \(none\)/);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("implementation task retries once before blocking when first agent turn makes no changes", async () => {
  let requestCount = 0;
  const server = createServer((_, res) => {
    requestCount += 1;
    res.setHeader("content-type", "application/json");
    if (requestCount === 1) {
      res.end(JSON.stringify({ choices: [{ message: { content: "done" } }] }));
      return;
    }
    if (requestCount === 2) {
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call_1",
                    function: {
                      name: "write",
                      arguments: JSON.stringify({ path: "implementation.txt", content: "second pass change" })
                    }
                  }
                ]
              }
            }
          ]
        })
      );
      return;
    }

    res.end(JSON.stringify({ choices: [{ message: { content: "done after retry" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-retry-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            worker: {
              id: "gpt-test",
              provider: "openai-compatible",
              name: "gpt-test",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/chat/completions",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
          execution: {
            workerMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Provider-backed retry worker demo", true);
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
    const taskState = runtime.getTaskStateSnapshot();
    const status = runtime.getStatus();
    const note = await readFile(taskState.taskOutputs[taskId], "utf8");
    const implementation = await readFile(join(cwd, "implementation.txt"), "utf8");

    assert.equal(taskId, "T2");
    assert.equal(status.phase, "implementing");
    assert.equal(status.activeTaskStatus, "in_progress");
    assert.equal(status.activeTaskRecoveryHint, null);
    assert.equal(status.blocker, null);
    assert.equal(implementation, "second pass change");
    assert.match(note, /implementation\.txt/);
    assert.equal(requestCount, 3);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("blank node cli repos get a minimal bootstrap before implementation agent runs", async () => {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "done" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-bootstrap-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            worker: {
              id: "gpt-test",
              provider: "openai-compatible",
              name: "gpt-test",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/chat/completions",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
          execution: {
            workerMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Build a dependency-free Node.js CLI called sample-tool", true);
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
    const taskState = runtime.getTaskStateSnapshot();
    const note = await readFile(taskState.taskOutputs[taskId], "utf8");

    assert.equal(taskId, "T2");
    assert.match(note, /## Changed Files/);
    assert.match(note, /package\.json/);
    assert.match(note, /README\.md/);
    assert.match(note, /src\/sample-tool\.js/);
    assert.match(note, /tests\/sample-tool\.test\.js/);
    const readmeBody = await readFile(join(cwd, "README.md"), "utf8");
    const sourceBody = await readFile(join(cwd, "src", "sample-tool.js"), "utf8");
    const testBody = await readFile(join(cwd, "tests", "sample-tool.test.js"), "utf8");
    await execFileAsync("pnpm", ["run", "test"], {
      cwd,
      env: {
        ...process.env
      }
    });

    assert.equal(await readFile(join(cwd, "package.json"), "utf8").then(body => body.includes("\"sample-tool\"")), true);
    assert.match(readmeBody, /sample-tool/);
    assert.match(readmeBody, /sample-tool\.tasks\.json/);
    assert.match(sourceBody, /sample-tool\.tasks\.json/);
    assert.match(sourceBody, /case "add"/);
    assert.match(sourceBody, /case "list"/);
    assert.match(testBody, /adds a task and persists it/);
    assert.match(testBody, /lists persisted tasks/);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("blank node cli bootstrap generalizes to custom command sets", async () => {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "done" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-bootstrap-generic-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            worker: {
              id: "gpt-test",
              provider: "openai-compatible",
              name: "gpt-test",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/chat/completions",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
          execution: {
            workerMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan(
      "Build a dependency-free Node.js CLI called notes-cli that stores notes in a local JSON file and supports add, list, search, and archive commands with tests and a README.",
      true
    );
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
    const sourceBody = await readFile(join(cwd, "src", "notes-cli.js"), "utf8");
    const testBody = await readFile(join(cwd, "tests", "notes-cli.test.js"), "utf8");
    await execFileAsync("pnpm", ["run", "test"], {
      cwd,
      env: {
        ...process.env
      }
    });

    assert.equal(taskId, "T2");
    assert.match(sourceBody, /case "search"/);
    assert.match(sourceBody, /case "archive"/);
    assert.match(testBody, /notes-cli search command/);
    assert.match(testBody, /notes-cli archive command/);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("blank catalog webapp repos get a runnable promotional catalog bootstrap", async () => {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "done" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-bootstrap-webapp-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            worker: {
              id: "gpt-test",
              provider: "openai-compatible",
              name: "gpt-test",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/chat/completions",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
          execution: {
            workerMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan(
      "Build an interactive clothing product promotional catalog webapp with a branded landing page, catalog listing, category/tag/season filters, product detail pages, related products, inquiry/interest CTA, URL-backed filter state, responsive layout, mock data, tests, and a README.",
      true
    );
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
    const note = await readFile(runtime.getTaskStateSnapshot().taskOutputs[taskId], "utf8");
    const htmlBody = await readFile(join(cwd, "index.html"), "utf8");
    const appBody = await readFile(join(cwd, "src", "app.js"), "utf8");
    const catalogBody = await readFile(join(cwd, "src", "catalog.js"), "utf8");
    const testBody = await readFile(join(cwd, "tests", "catalog.test.js"), "utf8");
    await execFileAsync("pnpm", ["run", "test"], {
      cwd,
      env: {
        ...process.env
      }
    });

    assert.equal(taskId, "T2");
    assert.match(note, /index\.html/);
    assert.match(note, /src\/app\.js/);
    assert.match(htmlBody, /catalog-grid/);
    assert.match(htmlBody, /product-detail/);
    assert.match(appBody, /renderCatalog/);
    assert.match(catalogBody, /filterProducts/);
    assert.match(catalogBody, /getProductBySlug/);
    assert.match(testBody, /filterProducts/);
    assert.match(testBody, /getProductBySlug/);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("implementation task can use an openai-compatible worker model with responses-style function_call payloads", async () => {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        output: [
          {
            type: "function_call",
            id: "fc_1",
            name: "read",
            arguments: JSON.stringify({ path: "sample.txt" })
          }
        ]
      })
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-responses-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            worker: {
              id: "gpt-test",
              provider: "openai-compatible",
              name: "gpt-test",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/responses",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
          execution: {
            workerMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(join(cwd, "sample.txt"), "responses-style provider-backed read", "utf8");

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Provider-backed responses worker demo", true);
    await runtime.advanceMilestone();
    const taskId = await runtime.executeCurrentTask();
    const taskState = runtime.getTaskStateSnapshot();
    const note = await readFile(taskState.taskOutputs[taskId], "utf8");
    const status = runtime.getStatus();

    assert.equal(taskId, "T2");
    assert.equal(status.activeModelId, "gpt-test");
    assert.equal(status.activeExecutionMode, "agent");
    assert.match(note, /responses-style provider-backed read/);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("analysis task can use an openai-compatible planner model through the agent path", async () => {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: "tool:read sample.txt" } }]
      })
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-planner-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            planner: {
              id: "gpt-planner",
              provider: "openai-compatible",
              name: "gpt-planner",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/chat/completions",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
          execution: {
            plannerMode: "agent"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(join(cwd, "sample.txt"), "provider-backed planner read", "utf8");

    const runtime = await HarnessRuntime.create(cwd);
    await runtime.plan("Provider-backed planner demo", true);
    const taskId = await runtime.executeCurrentTask();
    const taskState = runtime.getTaskStateSnapshot();
    const note = await readFile(taskState.taskOutputs[taskId], "utf8");
    const status = runtime.getStatus();

    assert.equal(taskId, "T1");
    assert.equal(status.activeModelId, "gpt-planner");
    assert.equal(status.activeExecutionMode, "agent");
    assert.match(note, /provider-backed planner read/);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("verification task can use an openai-compatible validator model through the agent path", async () => {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: "validation passed" } }]
      })
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-runtime-provider-validator-"));

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const { port } = server.address() as AddressInfo;
    await mkdir(join(cwd, ".harness"), { recursive: true });
    await writeFile(
      join(cwd, ".harness", "config.json"),
      JSON.stringify(
        {
          models: {
            validator: {
              id: "gpt-validator",
              provider: "openai-compatible",
              name: "gpt-validator",
              baseUrl: `http://127.0.0.1:${port}`,
              apiPath: "/v1/chat/completions",
              apiKeyEnvVar: "OPENAI_API_KEY"
            }
          },
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
    await runtime.plan("Provider-backed validator demo", true);
    const taskState = runtime.getTaskStateSnapshot();
    taskState.activeTaskId = "T3";
    taskState.tasks.T1 = "done";
    taskState.tasks.T2 = "done";
    taskState.tasks.T3 = "todo";
    taskState.taskVerificationCommands.T3 = ["printf verified"];
    const { saveTaskState } = await import("../packages/harness-runtime/src/state/task-state.js");
    await saveTaskState(join(cwd, ".harness", "artifacts", "task-state.json"), taskState);

    const refreshed = await HarnessRuntime.create(cwd);
    const result = await refreshed.continueTaskLoop();
    const status = refreshed.getStatus();
    const verificationBody = status.lastVerificationPath
      ? await readFile(status.lastVerificationPath, "utf8")
      : "";

    assert.match(result, /verification task -> pass/);
    assert.equal(status.activeModelId, "gpt-validator");
    assert.equal(status.activeExecutionMode, "agent");
    assert.match(verificationBody, /Provider: openai-compatible/);
    assert.match(verificationBody, /Model: gpt-validator/);
    assert.match(verificationBody, /validation path: agent/);
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
