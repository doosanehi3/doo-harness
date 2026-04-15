export interface HelpPayload {
  overview: string;
  quickStart: string[];
  commandGroups: Array<{
    title: string;
    commands: string[];
  }>;
}

export function buildHelpPayload(): HelpPayload {
  return {
    overview:
      "Harness is a pi-ready runtime-core product and long-running coding runtime focused on artifact-led state, verification, recovery, and provider-aware operation.",
    quickStart: [
      "Initialize config: harness config init or harness config init openai-codex",
      "Run onboarding checks: harness doctor, harness provider check, harness provider doctor",
      "Start work: harness plan <goal> or harness longrun <goal>",
      "Drive the operator loop: harness help, harness status, harness status compact, harness status dashboard, harness verify, harness handoff, harness reset, harness resume",
      "Review or relocate context: harness review quick|diff|deep|history|artifact, harness find <name>, harness grep <text>, harness recent review",
      "Operational entrypoints: harness blocked, harness queue review, harness pickup",
      "Artifact inspection: harness artifacts [type], harness artifacts related, harness timeline",
      "Bootstrap presets: harness bootstrap"
    ],
    commandGroups: [
      {
        title: "Operator Loop",
        commands: [
          "harness help [--json]",
          "harness status [--json]",
          "harness status compact [--json]",
          "harness status dashboard [--json]",
          "harness verify [--json]",
          "harness handoff [--json]",
          "harness reset [--json]",
          "harness resume [--json]"
        ]
      },
      {
        title: "Core Flow",
        commands: [
          "harness status [--json]",
          "harness status compact [--json]",
          "harness status dashboard [--json]",
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
          "harness review history [--json]",
          "harness review artifact [--json] <type|path>",
          "harness find [--json] <file-query>",
          "harness grep [--json] <content-query>",
          "harness artifacts [--json] [type]",
          "harness recent [--json] review|verification|handoff"
        ]
      },
      {
        title: "Artifacts and Timeline",
        commands: [
          "harness artifacts [--json] [type]",
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
          "harness handoff [--json]"
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
        commands: ["/status", "/plan", "/longrun", "/continue", "/provider-check", "/provider-smoke", "/provider-doctor", "/web-smoke", "/web-verify"]
      }
    ]
  };
}

export function runHelp(): string {
  const payload = buildHelpPayload();
  return [
    "# Harness Help",
    "",
    payload.overview,
    "",
    "Quick Start:",
    ...payload.quickStart.map(line => `- ${line}`),
    "",
    ...payload.commandGroups.flatMap(group => [group.title + ":", ...group.commands.map(command => `- ${command}`), ""])
  ]
    .filter(Boolean)
    .join("\n");
}
