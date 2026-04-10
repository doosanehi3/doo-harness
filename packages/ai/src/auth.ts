import { homedir } from "node:os";
import { arch, platform, release } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { Model } from "./types.js";

const PROVIDER_API_KEY_ENV_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  "openai-compatible": "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  mistral: "MISTRAL_API_KEY"
};

type ApiKeyCredential = {
  type: "api_key";
  key: string;
};

type OAuthCredential = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  [key: string]: unknown;
};

type AuthCredential = ApiKeyCredential | OAuthCredential;
type AuthStorageData = Record<string, AuthCredential>;

export function getDefaultApiKeyEnvVar(provider: string): string {
  return PROVIDER_API_KEY_ENV_MAP[provider] ?? "OPENAI_API_KEY";
}

export function getDefaultPiAuthPath(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  if (agentDir) {
    if (agentDir === "~") {
      return join(homedir(), "auth.json");
    }
    if (agentDir.startsWith("~/")) {
      return join(homedir(), agentDir.slice(2), "auth.json");
    }
    return join(agentDir, "auth.json");
  }

  return join(homedir(), ".pi", "agent", "auth.json");
}

function decodeAccountIdFromJwt(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as {
      "https://api.openai.com/auth"?: { chatgpt_account_id?: string };
    };
    const accountId = payload["https://api.openai.com/auth"]?.chatgpt_account_id;
    return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
  } catch {
    return null;
  }
}

function readPiAuthCredential(
  providerId: string,
  authStoragePath: string
): AuthCredential | undefined {
  try {
    const raw = readFileSync(authStoragePath, "utf8");
    const parsed = JSON.parse(raw) as AuthStorageData;
    return parsed[providerId];
  } catch {
    return undefined;
  }
}

export interface ResolvedModelAuth {
  source: "env" | "pi-auth";
  envVar: string | null;
  credentialLocation: string;
  apiKey?: string;
  authHeaderName: string;
  authPrefix: string | null;
  extraHeaders?: Record<string, string>;
}

export function resolveAuthForModel(model: Model): ResolvedModelAuth {
  const authSource =
    model.authSource ?? (model.provider === "openai-codex" ? "pi-auth" : "env");

  if (authSource === "pi-auth") {
    const authStoragePath = model.authStoragePath ?? getDefaultPiAuthPath();
    const providerId = model.oauthProviderId ?? (model.provider === "openai-codex" ? "openai-codex" : model.provider);
    const credential = readPiAuthCredential(providerId, authStoragePath);
    const authHeaderName = model.apiKeyHeaderName ?? "Authorization";
    const authPrefix =
      authHeaderName.toLowerCase() === "authorization"
        ? (model.apiKeyPrefix ?? "Bearer")
        : (model.apiKeyPrefix ?? null);

    if (!credential) {
      return {
        source: "pi-auth",
        envVar: null,
        credentialLocation: authStoragePath,
        authHeaderName,
        authPrefix
      };
    }

    if (credential.type === "api_key") {
      return {
        source: "pi-auth",
        envVar: null,
        credentialLocation: authStoragePath,
        apiKey: credential.key,
        authHeaderName,
        authPrefix
      };
    }

    const accountId =
      typeof credential.accountId === "string" && credential.accountId.length > 0
        ? credential.accountId
        : decodeAccountIdFromJwt(credential.access);

    return {
      source: "pi-auth",
      envVar: null,
      credentialLocation: authStoragePath,
      apiKey: credential.access,
      authHeaderName,
      authPrefix,
      extraHeaders:
        model.provider === "openai-codex" && accountId
          ? {
              "chatgpt-account-id": accountId,
              originator: "pi",
              "User-Agent": `pi (${platform()} ${release()}; ${arch()})`,
              "OpenAI-Beta": "responses=experimental"
            }
          : undefined
    };
  }

  const envVar = model.apiKeyEnvVar ?? getDefaultApiKeyEnvVar(model.provider);
  return {
    source: "env",
    envVar,
    credentialLocation: envVar,
    apiKey: process.env[envVar],
    authHeaderName: model.apiKeyHeaderName ?? "Authorization",
    authPrefix:
      (model.apiKeyHeaderName ?? "Authorization").toLowerCase() === "authorization"
        ? (model.apiKeyPrefix ?? "Bearer")
        : (model.apiKeyPrefix ?? null)
  };
}

export interface ModelAuthReadiness {
  provider: string;
  modelId: string;
  authSource: "env" | "pi-auth";
  envVar: string | null;
  credentialLocation: string;
  hasApiKey: boolean;
  status: "ready" | "missing_credentials";
  suggestedAction: string;
  authHeaderName: string;
  authPrefix: string | null;
  baseUrl: string | null;
  apiPath: string | null;
}

export function getModelAuthReadiness(model: Model): ModelAuthReadiness {
  const resolved = resolveAuthForModel(model);
  const status = resolved.apiKey ? "ready" : "missing_credentials";
  const suggestedAction = resolved.apiKey
    ? "Ready to use."
    : resolved.source === "pi-auth"
      ? `Create ${resolved.credentialLocation} via ChatGPT OAuth, then rerun /provider-check.`
      : `Set ${resolved.envVar} and rerun /provider-check.`;
  return {
    provider: model.provider,
    modelId: model.id,
    authSource: resolved.source,
    envVar: resolved.envVar,
    credentialLocation: resolved.credentialLocation,
    hasApiKey: Boolean(resolved.apiKey),
    status,
    suggestedAction,
    authHeaderName: resolved.authHeaderName,
    authPrefix: resolved.authPrefix,
    baseUrl: model.baseUrl ?? null,
    apiPath: model.apiPath ?? null
  };
}
