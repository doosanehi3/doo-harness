import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import { createModel } from "../packages/ai/src/index.js";
import { Agent } from "../packages/agent-core/src/agent.js";
import { createDefaultCodingTools } from "../packages/agent-core/src/tools/defaults.js";

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "doo-agent-loop-"));
}

test("agent loop executes a tool call and records tool result", async () => {
  const cwd = await createTempDir();
  try {
    const model = createModel({
      id: "stub",
      provider: "local",
      name: "stub",
      reasoning: false
    });
    const agent = new Agent({
      model,
      tools: createDefaultCodingTools(cwd)
    });

    await agent.prompt({
      role: "user",
      content: "tool:write path=test.txt content=hello",
      timestamp: Date.now()
    });

    const toolResult = agent.state.messages.find(message => message.role === "tool_result");
    assert.ok(toolResult);
    if (toolResult && toolResult.role === "tool_result") {
      assert.equal(toolResult.toolName, "write");
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("agent loop plans and executes a read tool from natural language", async () => {
  const cwd = await createTempDir();
  try {
    const filePath = join(cwd, "hello.txt");
    await import("node:fs/promises").then(fs => fs.writeFile(filePath, "hello from file", "utf8"));
    const model = createModel({
      id: "stub",
      provider: "local",
      name: "stub",
      reasoning: false
    });
    const agent = new Agent({
      model,
      tools: createDefaultCodingTools(cwd)
    });

    await agent.prompt({
      role: "user",
      content: "read hello.txt",
      timestamp: Date.now()
    });

    const toolResult = [...agent.state.messages].reverse().find(message => message.role === "tool_result");
    assert.ok(toolResult);
    if (toolResult && toolResult.role === "tool_result") {
      assert.equal(toolResult.toolName, "read");
      assert.equal(toolResult.content[0]?.text, "hello from file");
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("agent loop plans and executes a bash tool from natural language", async () => {
  const cwd = await createTempDir();
  try {
    const model = createModel({
      id: "stub",
      provider: "local",
      name: "stub",
      reasoning: false
    });
    const agent = new Agent({
      model,
      tools: createDefaultCodingTools(cwd)
    });

    await agent.prompt({
      role: "user",
      content: "run printf 'hello-shell'",
      timestamp: Date.now()
    });

    const toolResult = [...agent.state.messages].reverse().find(message => message.role === "tool_result");
    assert.ok(toolResult);
    if (toolResult && toolResult.role === "tool_result") {
      assert.equal(toolResult.toolName, "bash");
      assert.equal(toolResult.content[0]?.text, "hello-shell");
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("agent loop continues after tool execution until final assistant message", async () => {
  const cwd = await createTempDir();
  let requestCount = 0;
  const server = createServer(async (req, res) => {
    requestCount += 1;
    res.setHeader("content-type", "application/json");
    if (requestCount === 1) {
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
                      arguments: JSON.stringify({ path: "hello.txt", content: "hello" })
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

    res.end(JSON.stringify({ choices: [{ message: { content: "done" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createModel({
      id: "gpt-test",
      provider: "openai-compatible",
      name: "gpt-test",
      reasoning: false,
      baseUrl: `http://127.0.0.1:${address.port}`
    });
    const agent = new Agent({
      model,
      systemPrompt: "Use tools when needed and continue until done.",
      tools: createDefaultCodingTools(cwd)
    });

    await agent.prompt({
      role: "user",
      content: "Create hello.txt and then confirm completion.",
      timestamp: Date.now()
    });

    const messages = agent.state.messages;
    assert.ok(messages.some(message => message.role === "tool_result"));
    const last = messages[messages.length - 1];
    assert.ok(last);
    assert.equal(last?.role, "assistant");
    if (last?.role === "assistant") {
      assert.equal(last.content[0]?.type, "text");
      if (last.content[0]?.type === "text") {
        assert.equal(last.content[0].text, "done");
      }
    }
  } finally {
    delete process.env.OPENAI_API_KEY;
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
