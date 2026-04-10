import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModelAuthReadiness, resolveAuthForModel } from "../packages/ai/src/auth.js";

test("getModelAuthReadiness reports env and auth defaults", () => {
  const readiness = getModelAuthReadiness({
    id: "gpt-test",
    provider: "openai-compatible",
    name: "gpt-test",
    reasoning: false
  });

  assert.equal(readiness.envVar, "OPENAI_API_KEY");
  assert.equal(readiness.authSource, "env");
  assert.equal(readiness.credentialLocation, "OPENAI_API_KEY");
  assert.equal(readiness.hasApiKey, false);
  assert.equal(readiness.status, "missing_credentials");
  assert.match(readiness.suggestedAction, /Set OPENAI_API_KEY/);
  assert.equal(readiness.authHeaderName, "Authorization");
  assert.equal(readiness.authPrefix, "Bearer");
  assert.equal(readiness.baseUrl, null);
  assert.equal(readiness.apiPath, null);
});

test("getModelAuthReadiness respects custom auth header and prefix", () => {
  const readiness = getModelAuthReadiness({
    id: "provider-model",
    provider: "openai-compatible",
    name: "provider-model",
    reasoning: false,
    apiKeyEnvVar: "CUSTOM_API_KEY",
    apiKeyHeaderName: "x-api-key",
    baseUrl: "https://example.test",
    apiPath: "/v1/responses"
  });

  assert.equal(readiness.envVar, "CUSTOM_API_KEY");
  assert.equal(readiness.authSource, "env");
  assert.equal(readiness.credentialLocation, "CUSTOM_API_KEY");
  assert.equal(readiness.status, "missing_credentials");
  assert.match(readiness.suggestedAction, /Set CUSTOM_API_KEY/);
  assert.equal(readiness.authHeaderName, "x-api-key");
  assert.equal(readiness.authPrefix, null);
  assert.equal(readiness.baseUrl, "https://example.test");
  assert.equal(readiness.apiPath, "/v1/responses");
});

test("resolveAuthForModel reads openai-codex oauth credentials from pi auth storage", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "doo-harness-pi-auth-"));
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

    const resolved = resolveAuthForModel({
      id: "gpt-5.3-codex",
      provider: "openai-codex",
      name: "gpt-5.3-codex",
      reasoning: true,
      authStoragePath: authPath
    });
    const readiness = getModelAuthReadiness({
      id: "gpt-5.3-codex",
      provider: "openai-codex",
      name: "gpt-5.3-codex",
      reasoning: true,
      authStoragePath: authPath
    });

    assert.equal(resolved.source, "pi-auth");
    assert.equal(resolved.credentialLocation, authPath);
    assert.equal(resolved.apiKey, accessToken);
    assert.equal(resolved.extraHeaders?.["chatgpt-account-id"], "acct_test_123");
    assert.equal(resolved.extraHeaders?.originator, "pi");
    assert.equal(readiness.authSource, "pi-auth");
    assert.equal(readiness.envVar, null);
    assert.equal(readiness.credentialLocation, authPath);
    assert.equal(readiness.hasApiKey, true);
    assert.equal(readiness.status, "ready");
    assert.equal(readiness.suggestedAction, "Ready to use.");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
