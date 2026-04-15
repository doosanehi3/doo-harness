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
}

export interface DoctorPayload {
  mode: "doctor";
  cwd: string;
  configPath: string;
  hasRuntimeConfig: boolean;
  tools: ToolReadiness[];
  providerReadiness: Array<{
    role: string;
    status: string;
    provider: string;
    suggestedAction: string;
  }>;
  nextSteps: string[];
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
      purpose: "Run the harness CLI and workspace scripts"
    },
    {
      name: "pnpm",
      installed: await hasCommand("pnpm"),
      required: true,
      purpose: "Install dependencies and run check/test/smoke scripts"
    },
    {
      name: "rg",
      installed: await hasCommand("rg"),
      required: true,
      purpose: "Power review/search and artifact retrieval commands"
    },
    {
      name: "pi",
      installed: await hasCommand("pi"),
      required: false,
      purpose: "Run interactive pi-hosted extension workflows"
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

  const missingRequired = tools.filter(tool => tool.required && !tool.installed).length;
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
    tools,
    providerReadiness: providerReadiness.map(item => ({
      role: item.role,
      status: item.status,
      provider: item.provider,
      suggestedAction: item.suggestedAction
    })),
    nextSteps,
    summary
  };
}

export function runDoctor(payload: DoctorPayload): string {
  return [
    payload.summary,
    `Config: ${payload.hasRuntimeConfig ? payload.configPath : "(missing)"}`,
    "Tools:",
    ...payload.tools.map(
      tool => `- ${tool.name}: ${tool.installed ? "ready" : "missing"}${tool.required ? " (required)" : " (optional)"}`
    ),
    "Provider readiness:",
    ...payload.providerReadiness.map(item => `- ${item.role}: ${item.status} via ${item.provider}`),
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

export function buildBootstrapPayload(selectedPreset: string | null = null): BootstrapPayload {
  const presets = BOOTSTRAP_PRESETS;

  return {
    mode: "bootstrap",
    selectedPreset,
    presets: selectedPreset ? presets.filter(preset => preset.id === selectedPreset) : presets,
    summary: selectedPreset ? `Bootstrap preset: ${selectedPreset}` : `${presets.length} bootstrap presets available.`
  };
}

export function runBootstrap(payload: BootstrapPayload): string {
  return [
    payload.summary,
    ...payload.presets.flatMap(preset => [
      `${preset.id}: ${preset.label}`,
      `  when=${preset.whenToUse}`,
      `  kickoff=${preset.kickoff}`,
      ...preset.notes.map(note => `  note=${note}`)
    ])
  ].join("\n");
}
