export interface HelpPayload {
  overview: string;
  quickStart: string[];
  contextual: {
    focus: "onboarding" | "active-run" | "paused-recovery" | "idle-runtime" | "preserved-handoff";
    reason: string;
    commands: string[];
  };
  commandGroups: Array<{
    title: string;
    commands: string[];
  }>;
}

export function buildHelpPayload(context?: {
  phase?: string;
  goalSummary?: string | null;
  blocker?: string | null;
  hasRuntimeConfig?: boolean;
  hasPreservedHandoff?: boolean;
}): HelpPayload {
  const focus =
    context?.blocker
      ? {
          focus: "paused-recovery" as const,
          reason: "The runtime is blocked or paused and needs a recovery-first view.",
          commands: ["harness status dashboard --json", "harness blocked --json", "harness pickup --json"]
        }
      : context?.phase && context.phase !== "idle" && context.phase !== "completed" && context.phase !== "cancelled"
        ? {
            focus: "active-run" as const,
          reason: "The runtime already has active work, so status and pickup surfaces come first.",
          commands: ["harness status dashboard --json", "harness status lanes --json", "harness pickup --json"]
        }
        : context?.hasPreservedHandoff
          ? {
              focus: "preserved-handoff" as const,
              reason: "The runtime is inactive but a preserved handoff exists, so handoff inspection comes first.",
              commands: ["harness handoff inspect --json", "harness status dashboard --json", "harness status readiness --json"]
            }
        : context?.hasRuntimeConfig === false
          ? {
              focus: "onboarding" as const,
              reason: "Runtime config is missing, so setup commands come first.",
              commands: ["harness doctor --json", "harness config init openai-codex", "harness bootstrap --json"]
            }
          : {
              focus: "idle-runtime" as const,
              reason: "The runtime is idle, so starting or resuming work is the next step.",
              commands: ["harness bootstrap --json", "harness auto <goal>", "harness status --json"]
            };

  return {
    overview:
      "Harness is a pi-ready runtime-core product and long-running coding runtime focused on artifact-led state, verification, recovery, and provider-aware operation.",
    quickStart: [
      "Initialize config: harness config init or harness config init openai-codex",
      "Run onboarding checks: harness doctor, harness provider check, harness provider doctor",
      "Start work: harness auto <goal>, harness plan <goal>, or harness longrun <goal>",
      "Drive the operator loop: harness help, harness status, harness status compact, harness status dashboard, harness verify, harness handoff, harness reset, harness resume",
      "Review or relocate context: harness review quick|diff|deep|compare|history|artifact, harness find <name>, harness grep <text>, harness recent review|failures|active-task",
      "Operational entrypoints: harness blocked, harness queue review, harness pickup",
      "Artifact inspection: harness artifacts [type], harness artifacts inspect [type|path], harness artifacts related, harness timeline",
      "Bootstrap presets: harness bootstrap"
    ],
    contextual: focus,
    commandGroups: [
      {
        title: "Operator Loop",
        commands: [
          "harness help [--json]",
          "harness auto [--json] [--steps N] [goal]",
          "harness status [--json]",
          "harness status notes [--json]",
          "harness status today [--json]",
          "harness status ship [--json]",
          "harness status readiness [--json]",
          "harness status lanes [--json]",
          "harness status compact [--json]",
          "harness status dashboard [--json]",
          "harness verify [--json]",
          "harness handoff [--json]",
          "harness handoff inspect [--json]",
          "harness handoff cleanup [--json]",
          "harness reset [--json]",
          "harness resume [--json]"
        ]
      },
      {
        title: "Core Flow",
        commands: [
          "harness status [--json]",
          "harness status notes [--json]",
          "harness status today [--json]",
          "harness status ship [--json]",
          "harness status readiness [--json]",
          "harness status lanes [--json]",
          "harness status compact [--json]",
          "harness status dashboard [--json]",
          "harness auto [--json] [--steps N] [goal]",
          "harness plan [--json] <goal>",
          "harness longrun [--json] <goal>",
          "harness continue [--json]",
          "harness loop [--json] [maxSteps]",
          "harness execute [--json]",
          "harness verify [--json]",
          "harness review [--json]"
        ]
      },
      {
        title: "Review and Search",
        commands: [
          "harness review quick [--json]",
          "harness review diff [--json]",
          "harness review deep [--json]",
          "harness review compare [--json]",
          "harness review history [--json]",
          "harness review artifact [--json] <type|path>",
          "harness find [--json] <file-query>",
          "harness grep [--json] <content-query>",
          "harness artifacts [--json] [type]",
          "harness recent [--json] review|verification|handoff|failures|active-task"
        ]
      },
      {
        title: "Artifacts and Timeline",
        commands: [
          "harness artifacts [--json] [type]",
          "harness artifacts inspect [--json] [type|path]",
          "harness artifacts related [--json] [taskId]",
          "harness timeline [--json]"
        ]
      },
      {
        title: "Task State",
        commands: [
          "harness advance [--json]",
          "harness block [--json] <reason>",
          "harness unblock [--json]",
          "harness resume [--json]",
          "harness reset [--json]",
          "harness handoff [--json]",
          "harness handoff inspect [--json]",
          "harness handoff cleanup [--json]"
        ]
      },
      {
        title: "Operational Entry Points",
        commands: [
          "harness blocked [--json]",
          "harness queue review [--json]",
          "harness pickup [--json]"
        ]
      },
      {
        title: "Provider",
        commands: [
          "harness config init",
          "harness config init openai-codex",
          "harness config show",
          "harness provider check [--json]",
          "harness provider smoke [--json] [role]",
          "harness provider doctor [--json]"
        ]
      },
      {
        title: "Onboarding",
        commands: [
          "harness doctor [--json]",
          "harness bootstrap [--json] [preset]"
        ]
      },
      {
        title: "Web",
        commands: ["harness web smoke [--json]", "harness web verify [--json]"]
      },
      {
        title: "Compatibility",
        commands: ["/status", "/status notes", "/status today", "/status ship", "/status readiness", "/status lanes", "/auto", "/plan", "/longrun", "/continue", "/provider-check", "/provider-smoke", "/provider-doctor", "/web-smoke", "/web-verify"]
      }
    ]
  };
}

export function runHelp(payload: HelpPayload = buildHelpPayload()): string {
  return [
    "# Harness Help",
    "",
    payload.overview,
    "",
    "Quick Start:",
    ...payload.quickStart.map(line => `- ${line}`),
    "",
    "Start Here:",
    `- focus=${payload.contextual.focus}`,
    `- reason=${payload.contextual.reason}`,
    ...payload.contextual.commands.map(command => `- ${command}`),
    "",
    ...payload.commandGroups.flatMap(group => [group.title + ":", ...group.commands.map(command => `- ${command}`), ""])
  ]
    .filter(Boolean)
    .join("\n");
}
