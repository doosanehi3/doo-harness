import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { complete, createOpenAICompatibleModel, getDefaultApiKeyEnvVar } from "../packages/ai/src/index.js";

function createMockServer(responseBody: unknown) {
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(responseBody));
  });
  return server;
}

test("openai-compatible model returns text assistant message", async () => {
  const server = createMockServer({
    choices: [{ message: { content: "hello from provider" } }]
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      baseUrl: `http://127.0.0.1:${address.port}`
    });

    const message = await complete(model, {
      systemPrompt: "You are a test assistant.",
      messages: [{ role: "user", content: "say hello", timestamp: Date.now() }]
    });

    assert.equal(message.stopReason, "stop");
    assert.deepEqual(message.content, [{ type: "text", text: "hello from provider" }]);
  } finally {
    server.close();
  }
});

test("openai-compatible model converts tool directive text into tool_call", async () => {
  const server = createMockServer({
    choices: [{ message: { content: "tool:read README.md" } }]
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      baseUrl: `http://127.0.0.1:${address.port}`
    });

    const message = await complete(model, {
      systemPrompt: "Use tools when needed.",
      messages: [{ role: "user", content: "inspect the readme", timestamp: Date.now() }],
      tools: [{ name: "read", description: "Read a file" }]
    });

    assert.equal(message.stopReason, "tool_use");
    assert.equal(message.content[0]?.type, "tool_call");
    if (message.content[0]?.type === "tool_call") {
      assert.equal(message.content[0].name, "read");
      assert.deepEqual(message.content[0].arguments, { path: "README.md" });
    }
  } finally {
    server.close();
  }
});

test("openai-compatible model converts native tool_calls into tool_call content", async () => {
  const server = createMockServer({
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: "call_1",
              function: {
                name: "read",
                arguments: JSON.stringify({ path: "README.md" })
              }
            }
          ]
        }
      }
    ]
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      baseUrl: `http://127.0.0.1:${address.port}`
    });

    const message = await complete(model, {
      systemPrompt: "Use tools when needed.",
      messages: [{ role: "user", content: "inspect the readme", timestamp: Date.now() }],
      tools: [{ name: "read", description: "Read a file" }]
    });

    assert.equal(message.stopReason, "tool_use");
    assert.equal(message.content[0]?.type, "tool_call");
    if (message.content[0]?.type === "tool_call") {
      assert.equal(message.content[0].id, "call_1");
      assert.equal(message.content[0].name, "read");
      assert.deepEqual(message.content[0].arguments, { path: "README.md" });
    }
  } finally {
    server.close();
  }
});

test("openai-compatible model reports missing API key as assistant error message", async () => {
  const model = createOpenAICompatibleModel({
    id: "gpt-test",
    baseUrl: "http://127.0.0.1:9999",
    apiKeyEnvVar: "MISSING_TEST_KEY"
  });

  delete process.env.MISSING_TEST_KEY;
  const message = await complete(model, {
    systemPrompt: "You are a test assistant.",
    messages: [{ role: "user", content: "hello", timestamp: Date.now() }]
  });

  assert.equal(message.stopReason, "error");
  assert.match(message.errorMessage ?? "", /missing api key/i);
});

test("provider aliases resolve default API key env vars", () => {
  assert.equal(getDefaultApiKeyEnvVar("openai"), "OPENAI_API_KEY");
  assert.equal(getDefaultApiKeyEnvVar("openrouter"), "OPENROUTER_API_KEY");
  assert.equal(getDefaultApiKeyEnvVar("groq"), "GROQ_API_KEY");
  assert.equal(getDefaultApiKeyEnvVar("unknown-provider"), "OPENAI_API_KEY");
});

test("openai-compatible model can infer provider-specific API key env var", async () => {
  const server = createMockServer({
    choices: [{ message: { content: "hello from openrouter" } }]
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "openrouter/test-model",
      provider: "openrouter",
      baseUrl: `http://127.0.0.1:${address.port}`
    });

    const message = await complete(model, {
      systemPrompt: "You are a test assistant.",
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }]
    });

    assert.equal(message.stopReason, "stop");
    assert.deepEqual(message.content, [{ type: "text", text: "hello from openrouter" }]);
  } finally {
    server.close();
    delete process.env.OPENROUTER_API_KEY;
  }
});

test("openai-compatible model reports HTTP failure as assistant error message", async () => {
  const server = createServer((_, res) => {
    res.statusCode = 401;
    res.setHeader("content-type", "text/plain");
    res.end("unauthorized");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      baseUrl: `http://127.0.0.1:${address.port}`
    });

    const message = await complete(model, {
      systemPrompt: "You are a test assistant.",
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }]
    });

    assert.equal(message.stopReason, "error");
    assert.match(message.errorMessage ?? "", /unauthorized/i);
  } finally {
    server.close();
  }
});

test("openai-compatible model supports responses-style output_text payloads", async () => {
  const server = createMockServer({
    output_text: "hello from responses api"
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      provider: "openai-compatible",
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiPath: "/v1/responses"
    });

    const message = await complete(model, {
      systemPrompt: "You are a test assistant.",
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }]
    });

    assert.equal(message.stopReason, "stop");
    assert.deepEqual(message.content, [{ type: "text", text: "hello from responses api" }]);
  } finally {
    server.close();
  }
});

test("openai-compatible model supports responses-style function_call payloads", async () => {
  const server = createMockServer({
    output: [
      {
        type: "function_call",
        id: "fc_1",
        name: "read",
        arguments: JSON.stringify({ path: "README.md" })
      }
    ]
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      provider: "openai-compatible",
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiPath: "/v1/responses"
    });

    const message = await complete(model, {
      systemPrompt: "Use tools when needed.",
      messages: [{ role: "user", content: "inspect the readme", timestamp: Date.now() }],
      tools: [{ name: "read", description: "Read a file" }]
    });

    assert.equal(message.stopReason, "tool_use");
    assert.equal(message.content[0]?.type, "tool_call");
    if (message.content[0]?.type === "tool_call") {
      assert.equal(message.content[0].id, "fc_1");
      assert.equal(message.content[0].name, "read");
      assert.deepEqual(message.content[0].arguments, { path: "README.md" });
    }
  } finally {
    server.close();
  }
});

test("openai-compatible model sends responses-style request bodies for responses endpoints", async () => {
  let requestBody: unknown = null;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ output_text: "ok" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      provider: "openai-compatible",
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiPath: "/v1/responses",
      temperature: 0.15,
      maxTokens: 123
    });

    await complete(model, {
      systemPrompt: "Use tools when needed.",
      messages: [{ role: "user", content: "inspect the readme", timestamp: Date.now() }],
      tools: [{ name: "read", description: "Read a file" }]
    });

    const parsed = requestBody as {
      input?: unknown[];
      messages?: unknown[];
      temperature?: number;
      max_output_tokens?: number;
    };
    assert.ok(Array.isArray(parsed.input));
    assert.equal(parsed.messages, undefined);
    assert.equal(parsed.temperature, 0.15);
    assert.equal(parsed.max_output_tokens, 123);
  } finally {
    server.close();
  }
});

test("openai-compatible model forwards temperature and maxTokens in request body", async () => {
  let requestBody: unknown = null;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.OPENAI_API_KEY = "test-key";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      provider: "openai-compatible",
      baseUrl: `http://127.0.0.1:${address.port}`,
      temperature: 0.25,
      maxTokens: 321
    });

    await complete(model, {
      systemPrompt: "You are a test assistant.",
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }]
    });

    const parsed = requestBody as { temperature?: number; max_tokens?: number };
    assert.equal(parsed.temperature, 0.25);
    assert.equal(parsed.max_tokens, 321);
  } finally {
    server.close();
  }
});

test("openai-compatible model supports custom API key header names and prefixes", async () => {
  let authHeader = "";
  const server = createServer((req, res) => {
    authHeader = String(req.headers["x-api-key"] ?? "");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    process.env.CUSTOM_TEST_KEY = "secret-value";
    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-test",
      provider: "openai-compatible",
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiKeyEnvVar: "CUSTOM_TEST_KEY",
      apiKeyHeaderName: "x-api-key",
      apiKeyPrefix: ""
    });

    await complete(model, {
      systemPrompt: "You are a test assistant.",
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }]
    });

    assert.equal(authHeader, "secret-value");
  } finally {
    server.close();
    delete process.env.CUSTOM_TEST_KEY;
  }
});

test("openai-codex model reads ChatGPT subscription auth from pi auth storage", async () => {
  let authHeader = "";
  let accountHeader = "";
  let originatorHeader = "";
  let userAgentHeader = "";
  let openAIBetaHeader = "";
  let requestPath = "";
  const server = createServer((req, res) => {
    authHeader = String(req.headers.authorization ?? "");
    accountHeader = String(req.headers["chatgpt-account-id"] ?? "");
    originatorHeader = String(req.headers.originator ?? "");
    userAgentHeader = String(req.headers["user-agent"] ?? "");
    openAIBetaHeader = String(req.headers["openai-beta"] ?? "");
    requestPath = req.url ?? "";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ output_text: "codex ok" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-openai-codex-"));
  try {
    const authPath = join(cwd, "auth.json");
    const jwtPayload = Buffer.from(
      JSON.stringify({
        "https://api.openai.com/auth": {
          chatgpt_account_id: "acct_test_123"
        }
      }),
      "utf8"
    ).toString("base64url");
    const accessToken = `header.${jwtPayload}.signature`;

    await writeFile(
      authPath,
      JSON.stringify(
        {
          "openai-codex": {
            type: "oauth",
            access: accessToken,
            refresh: "refresh-token",
            expires: Date.now() + 60_000
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const address = server.address() as AddressInfo;
    const model = createOpenAICompatibleModel({
      id: "gpt-5.3-codex",
      provider: "openai-codex",
      baseUrl: `http://127.0.0.1:${address.port}`,
      authSource: "pi-auth",
      authStoragePath: authPath
    });

    const message = await complete(model, {
      systemPrompt: "You are a test assistant.",
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }]
    });

    assert.equal(message.stopReason, "stop");
    assert.deepEqual(message.content, [{ type: "text", text: "codex ok" }]);
    assert.equal(authHeader, `Bearer ${accessToken}`);
    assert.equal(accountHeader, "acct_test_123");
    assert.equal(originatorHeader, "pi");
    assert.match(userAgentHeader, /^pi \(/);
    assert.equal(openAIBetaHeader, "responses=experimental");
    assert.equal(requestPath, "/codex/responses");
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
