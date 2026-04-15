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
      "Check provider readiness: harness provider check or harness provider doctor",
      "Start work: harness plan <goal> or harness longrun <goal>",
      "Drive the operator loop: harness help, harness status, harness verify, harness handoff, harness reset, harness resume",
      "Review or relocate context: harness review, harness find <name>, harness grep <text>"
    ],
    commandGroups: [
      {
        title: "Operator Loop",
        commands: [
          "harness help [--json]",
          "harness status [--json]",
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
          "harness review [--json]",
          "harness find [--json] <file-query>",
          "harness grep [--json] <content-query>"
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
