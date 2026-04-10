import type { Model } from "./types.js";

export function createModel(input: Model): Model {
  return input;
}

export function createOpenAICompatibleModel(input: {
  id: string;
  provider?: string;
  name?: string;
  authSource?: "env" | "pi-auth";
  oauthProviderId?: string;
  authStoragePath?: string;
  piMonoRoot?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl: string;
  apiPath?: string;
  apiKeyEnvVar?: string;
  apiKeyHeaderName?: string;
  apiKeyPrefix?: string;
  headers?: Record<string, string>;
  reasoning?: boolean;
}): Model {
  return {
    id: input.id,
    provider: input.provider ?? "openai-compatible",
    name: input.name ?? input.id,
    reasoning: input.reasoning ?? false,
    authSource: input.authSource,
    oauthProviderId: input.oauthProviderId,
    authStoragePath: input.authStoragePath,
    piMonoRoot: input.piMonoRoot,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    baseUrl: input.baseUrl,
    apiPath: input.apiPath,
    apiKeyEnvVar: input.apiKeyEnvVar,
    apiKeyHeaderName: input.apiKeyHeaderName,
    apiKeyPrefix: input.apiKeyPrefix,
    headers: input.headers
  };
}

export function createStubModel(): Model {
  return {
    id: "stub",
    provider: "local",
    name: "stub",
    reasoning: false
  };
}
