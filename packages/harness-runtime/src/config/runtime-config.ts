import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Model } from "@doo/harness-ai";

export type RuntimeModelConfig =
  | string
  | {
      id: string;
      provider?: string;
      name?: string;
      reasoning?: boolean;
      authSource?: "env" | "pi-auth";
      oauthProviderId?: string;
      authStoragePath?: string;
      piMonoRoot?: string;
      temperature?: number;
      maxTokens?: number;
      baseUrl?: string;
      apiPath?: string;
      apiKeyEnvVar?: string;
      apiKeyHeaderName?: string;
      apiKeyPrefix?: string;
      headers?: Record<string, string>;
    };

export interface RuntimeConfig {
  models: {
    default: RuntimeModelConfig;
    planner?: RuntimeModelConfig;
    worker?: RuntimeModelConfig;
    validator?: RuntimeModelConfig;
  };
  execution?: {
    plannerMode?: "agent" | "fresh" | "subprocess";
    workerMode?: "agent" | "fresh" | "subprocess";
    validatorMode?: "agent" | "fresh" | "subprocess";
  };
}

export type RuntimeConfigProfile = "default" | "openai-codex";

export interface ResolvedRuntimeConfig {
  models: {
    default: Model;
    planner: Model;
    worker: Model;
    validator: Model;
  };
  execution: {
    plannerMode: "agent" | "fresh" | "subprocess";
    workerMode: "agent" | "fresh" | "subprocess";
    validatorMode: "agent" | "fresh" | "subprocess";
  };
}

export function createDefaultRuntimeConfig(): RuntimeConfig {
  return {
    models: {
      default: "stub",
      planner: "stub-planner",
      worker: "stub-worker",
      validator: "stub-validator"
    },
    execution: {
      plannerMode: "fresh",
      workerMode: "agent",
      validatorMode: "fresh"
    }
  };
}

export function createOpenAICodexRuntimeConfig(): RuntimeConfig {
  return {
    models: {
      default: {
        id: "gpt-5.3-codex",
        provider: "openai-codex",
        authSource: "pi-auth"
      },
      planner: {
        id: "gpt-5.3-codex",
        provider: "openai-codex",
        authSource: "pi-auth"
      },
      worker: {
        id: "gpt-5.3-codex",
        provider: "openai-codex",
        authSource: "pi-auth"
      },
      validator: {
        id: "gpt-5.3-codex-spark",
        provider: "openai-codex",
        authSource: "pi-auth"
      }
    },
    execution: {
      plannerMode: "fresh",
      workerMode: "agent",
      validatorMode: "fresh"
    }
  };
}

function resolveRuntimeModel(input: RuntimeModelConfig | undefined, fallbackId: string): Model {
  if (!input) {
    return {
      id: fallbackId,
      provider: "local",
      name: fallbackId,
      reasoning: false
    };
  }

  if (typeof input === "string") {
    return {
      id: input,
      provider: "local",
      name: input,
      reasoning: false
    };
  }

  return {
    id: input.id,
    provider: input.provider ?? "local",
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

export async function loadRuntimeConfig(cwd: string): Promise<ResolvedRuntimeConfig> {
  const fallback = createDefaultRuntimeConfig();
  const path = join(cwd, ".harness", "config.json");

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<RuntimeConfig>;
    const merged = {
      models: {
        ...fallback.models,
        ...(parsed.models ?? {})
      },
      execution: {
        ...fallback.execution,
        ...(parsed.execution ?? {})
      }
    };
    return {
      models: {
        default: resolveRuntimeModel(merged.models.default, "stub"),
        planner: resolveRuntimeModel(merged.models.planner ?? merged.models.default, "stub-planner"),
        worker: resolveRuntimeModel(merged.models.worker ?? merged.models.default, "stub-worker"),
        validator: resolveRuntimeModel(merged.models.validator ?? merged.models.default, "stub-validator")
      },
      execution: {
        plannerMode: merged.execution.plannerMode ?? "fresh",
        workerMode: merged.execution.workerMode ?? "agent",
        validatorMode: merged.execution.validatorMode ?? "fresh"
      }
    };
  } catch {
    return {
      models: {
        default: resolveRuntimeModel(fallback.models.default, "stub"),
        planner: resolveRuntimeModel(fallback.models.planner ?? fallback.models.default, "stub-planner"),
        worker: resolveRuntimeModel(fallback.models.worker ?? fallback.models.default, "stub-worker"),
        validator: resolveRuntimeModel(fallback.models.validator ?? fallback.models.default, "stub-validator")
      },
      execution: {
        plannerMode: fallback.execution?.plannerMode ?? "fresh",
        workerMode: fallback.execution?.workerMode ?? "agent",
        validatorMode: fallback.execution?.validatorMode ?? "fresh"
      }
    };
  }
}

export async function writeDefaultRuntimeConfig(
  cwd: string,
  overwrite = false,
  profile: RuntimeConfigProfile = "default"
): Promise<string> {
  const path = join(cwd, ".harness", "config.json");
  if (!overwrite) {
    try {
      await readFile(path, "utf8");
      return path;
    } catch {
      // fall through and write default config
    }
  }

  await mkdir(join(cwd, ".harness"), { recursive: true });
  const config =
    profile === "openai-codex" ? createOpenAICodexRuntimeConfig() : createDefaultRuntimeConfig();
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", "utf8");
  return path;
}
