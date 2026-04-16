import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderRoleReadiness } from "@doo/harness-runtime";

const execFile = promisify(execFileCb);

export interface ToolReadiness {
  name: "node" | "pnpm" | "rg" | "pi";
  installed: boolean;
  required: boolean;
  purpose: string;
  installCommand: string;
}

export interface DoctorPayload {
  mode: "doctor";
  cwd: string;
  configPath: string;
  hasRuntimeConfig: boolean;
  ready: boolean;
  tools: ToolReadiness[];
  providerReadiness: Array<{
    role: string;
    status: string;
    provider: string;
    suggestedAction: string;
  }>;
  nextSteps: string[];
  firstRunCommands: string[];
  validationTracks: Array<{
    kind: "local" | "interactive" | "release";
    summary: string;
    commands: string[];
  }>;
  recommendedCommand: string;
  summary: string;
}

export interface BootstrapPreset {
  id: string;
  label: string;
  whenToUse: string;
  kickoff: string;
  notes: string[];
}

export interface BootstrapPayload {
  mode: "bootstrap";
  selectedPreset: string | null;
  recommendedPreset: string;
  recommendedReason: string;
  nextCommands: string[];
  presets: BootstrapPreset[];
  summary: string;
}

export interface BootstrapPresetParseResult {
  preset: string | null;
  invalidPreset: string | null;
}

async function hasCommand(name: string): Promise<boolean> {
  try {
    await execFile("/bin/sh", ["-lc", `command -v ${name}`]);
    return true;
  } catch {
    return false;
  }
}

export async function buildDoctorPayload(
  cwd: string,
  providerReadiness: ProviderRoleReadiness[]
): Promise<DoctorPayload> {
  const configPath = join(cwd, ".harness", "config.json");
  const tools: ToolReadiness[] = [
    {
      name: "node",
      installed: await hasCommand("node"),
      required: true,
      purpose: "Run the harness CLI and workspace scripts",
      installCommand: "Install Node.js 20+ and ensure `node` is on PATH."
    },
    {
      name: "pnpm",
      installed: await hasCommand("pnpm"),
      required: true,
      purpose: "Install dependencies and run check/test/smoke scripts",
      installCommand: "Run `corepack enable && corepack prepare pnpm@latest --activate`."
    },
    {
      name: "rg",
      installed: await hasCommand("rg"),
      required: true,
      purpose: "Power review/search and artifact retrieval commands",
      installCommand: "Install ripgrep and ensure `rg` is on PATH."
    },
    {
      name: "pi",
      installed: await hasCommand("pi"),
      required: false,
      purpose: "Run interactive pi-hosted extension workflows",
      installCommand: "Install the pi CLI if interactive pi extension workflows are needed."
    }
  ];

  const nextSteps: string[] = [];
  for (const tool of tools) {
    if (!tool.installed) {
      nextSteps.push(`Install ${tool.name} (${tool.purpose}).`);
    }
  }

  if (!existsSync(configPath)) {
    nextSteps.push("Initialize runtime config with `harness config init` or `harness config init openai-codex`.");
  }

  const missingProvider = providerReadiness.find(item => item.status !== "ready");
  if (missingProvider) {
    nextSteps.push(missingProvider.suggestedAction);
  } else {
    nextSteps.push("Run `harness provider doctor` to validate provider smoke end-to-end.");
  }

  nextSteps.push("Run `harness bootstrap` to choose the best starting preset for the repo shape.");
  const firstRunCommands = [
    existsSync(configPath) ? null : "harness config init openai-codex",
    missingProvider ? null : "harness provider doctor",
    "harness bootstrap",
    "harness auto <goal>"
  ].filter((item): item is string => Boolean(item));
  const validationTracks: DoctorPayload["validationTracks"] = [
    {
      kind: "local",
      summary: "Fast local validation for repo/runtime/provider correctness",
      commands: ["harness provider doctor", "harness web smoke --json", "harness web verify --json"]
    },
    {
      kind: "interactive",
      summary: "Interactive pi-hosted validation for extension rendering and command flow",
      commands: ["pnpm run smoke:pi:ui", "pnpm run smoke:pi:interactive"]
    },
    {
      kind: "release",
      summary: "Release-gate package and extension validation",
      commands: ["pnpm run smoke:pi:print", "pnpm run smoke:pi:install", "pnpm run smoke:pi:interactive"]
    }
  ];

  const missingRequired = tools.filter(tool => tool.required && !tool.installed).length;
  const ready = missingRequired === 0 && existsSync(configPath) && !missingProvider;
  const recommendedCommand =
    missingRequired > 0
      ? "harness doctor --json"
      : !existsSync(configPath)
        ? "harness config init openai-codex"
        : missingProvider
          ? "harness provider doctor"
          : "harness bootstrap";
  const summary =
    missingRequired > 0
      ? `${missingRequired} required tool(s) missing.`
      : !existsSync(configPath)
        ? "Shell is ready, but runtime config is missing."
        : "Environment looks ready for first-run validation.";

  return {
    mode: "doctor",
    cwd,
    configPath,
    hasRuntimeConfig: existsSync(configPath),
    ready,
    tools,
    providerReadiness: providerReadiness.map(item => ({
      role: item.role,
      status: item.status,
      provider: item.provider,
      suggestedAction: item.suggestedAction
    })),
    nextSteps,
    firstRunCommands,
    validationTracks,
    recommendedCommand,
    summary
  };
}

export function runDoctor(payload: DoctorPayload): string {
  return [
    payload.summary,
    `Config: ${payload.hasRuntimeConfig ? payload.configPath : "(missing)"}`,
    "Tools:",
    ...payload.tools.map(
      tool =>
        `- ${tool.name}: ${tool.installed ? "ready" : "missing"}${tool.required ? " (required)" : " (optional)"}${
          tool.installed ? "" : ` :: ${tool.installCommand}`
        }`
    ),
    "Provider readiness:",
    ...payload.providerReadiness.map(item => `- ${item.role}: ${item.status} via ${item.provider}`),
    `Recommended: ${payload.recommendedCommand}`,
    "First-run commands:",
    ...payload.firstRunCommands.map(command => `- ${command}`),
    "Validation tracks:",
    ...payload.validationTracks.flatMap(track => [`- ${track.kind}: ${track.summary}`, ...track.commands.map(command => `  - ${command}`)]),
    "Next steps:",
    ...payload.nextSteps.map(step => `- ${step}`)
  ].join("\n");
}

const BOOTSTRAP_PRESETS: BootstrapPreset[] = [
    {
      id: "node-cli",
      label: "Node CLI",
      whenToUse: "Command-line tools, scripts, and automation-first repos",
      kickoff: "harness longrun Build a node CLI for <goal>",
      notes: ["Good default for utility repos.", "Prefer when there is no browser UI."]
    },
    {
      id: "catalog-webapp",
      label: "Catalog Webapp",
      whenToUse: "Generic promotional or product catalog web experiences",
      kickoff: "harness longrun Build a catalog webapp for <goal>",
      notes: ["Good baseline for browser-first work.", "Pairs well with web smoke/verify surfaces."]
    },
    {
      id: "react-vite-catalog",
      label: "React Vite Catalog",
      whenToUse: "React/Vite frontend work with a fast local loop",
      kickoff: "harness longrun Build a react vite catalog webapp for <goal>",
      notes: ["Best when React + Vite is already the intended stack."]
    },
    {
      id: "nextjs-catalog",
      label: "Next.js Catalog",
      whenToUse: "Next.js app/router work or SSR-first product surfaces",
      kickoff: "harness longrun Build a nextjs catalog webapp for <goal>",
      notes: ["Best when deployment target or stack is already Next.js."]
    }
  ];

export function parseBootstrapPreset(raw: string): BootstrapPresetParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { preset: null, invalidPreset: null };
  }
  return BOOTSTRAP_PRESETS.some(preset => preset.id === trimmed)
    ? { preset: trimmed, invalidPreset: null }
    : { preset: null, invalidPreset: trimmed };
}

export function formatInvalidBootstrapPreset(raw: string): string {
  return `Unknown bootstrap preset: ${raw}. Allowed: ${BOOTSTRAP_PRESETS.map(item => item.id).join(", ")}`;
}

function inferBootstrapPreset(cwd: string): { id: string; reason: string } {
  if (
    existsSync(join(cwd, "next.config.js")) ||
    existsSync(join(cwd, "next.config.mjs")) ||
    existsSync(join(cwd, "next.config.ts")) ||
    existsSync(join(cwd, "app")) ||
    existsSync(join(cwd, "pages"))
  ) {
    return {
      id: "nextjs-catalog",
      reason: "Next.js-style files are present in the repo."
    };
  }

  if (
    existsSync(join(cwd, "vite.config.js")) ||
    existsSync(join(cwd, "vite.config.ts")) ||
    existsSync(join(cwd, "vite.config.mjs"))
  ) {
    return {
      id: "react-vite-catalog",
      reason: "Vite config is present, so the React/Vite preset is the closest fit."
    };
  }

  if (existsSync(join(cwd, "package.json"))) {
    return {
      id: "node-cli",
      reason: "A package.json exists but no stronger web-framework signal is present."
    };
  }

  return {
    id: "catalog-webapp",
    reason: "No repo-shape signal is present yet, so the generic browser-first preset is the safest default."
  };
}

export function buildBootstrapPayload(selectedPreset: string | null = null, cwd: string = process.cwd()): BootstrapPayload {
  const presets = BOOTSTRAP_PRESETS;
  const inferred = inferBootstrapPreset(cwd);
  const effectivePreset = selectedPreset ?? inferred.id;
  const effectivePresetMeta = presets.find(preset => preset.id === effectivePreset) ?? presets[0]!;
  const nextCommands = [
    effectivePresetMeta.kickoff,
    "harness status dashboard --json",
    "harness auto <goal>"
  ];

  return {
    mode: "bootstrap",
    selectedPreset,
    recommendedPreset: inferred.id,
    recommendedReason: inferred.reason,
    nextCommands,
    presets: selectedPreset ? presets.filter(preset => preset.id === selectedPreset) : presets,
    summary: selectedPreset
      ? `Bootstrap preset: ${selectedPreset}`
      : `${presets.length} bootstrap presets available. Recommended: ${inferred.id}.`
  };
}

export function runBootstrap(payload: BootstrapPayload): string {
  return [
    payload.summary,
    `Recommended preset: ${payload.recommendedPreset}`,
    `Reason: ${payload.recommendedReason}`,
    "Next commands:",
    ...payload.nextCommands.map(command => `- ${command}`),
    ...payload.presets.flatMap(preset => [
      `${preset.id}: ${preset.label}`,
      `  when=${preset.whenToUse}`,
      `  kickoff=${preset.kickoff}`,
      ...preset.notes.map(note => `  note=${note}`)
    ])
  ].join("\n");
}
