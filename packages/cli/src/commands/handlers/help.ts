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
      "Harness is a long-running coding runtime focused on artifact-led state, verification, recovery, and provider-aware operation.",
    quickStart: [
      "Initialize config: /config-init or /config-init-openai-codex",
      "Check provider readiness: /provider-check or /provider-doctor",
      "Start work: /plan <goal> or /longrun <goal>",
      "Drive progress: /continue, /status, /review, /handoff, /reset"
    ],
    commandGroups: [
      {
        title: "Core Flow",
        commands: ["/status", "/plan", "/longrun", "/continue", "/loop", "/execute", "/verify", "/review"]
      },
      {
        title: "Task State",
        commands: ["/advance", "/task-done", "/block", "/unblock", "/resume", "/reset", "/handoff"]
      },
      {
        title: "Provider",
        commands: ["/config-init", "/config-init-openai-codex", "/config-show", "/provider-check", "/provider-smoke", "/provider-doctor"]
      },
      {
        title: "Automation",
        commands: [
          "/status-json",
          "/plan-json",
          "/longrun-json",
          "/continue-json",
          "/loop-json",
          "/provider-check-json",
          "/provider-smoke-json",
          "/provider-doctor-json"
        ]
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
