export interface ParsedPlanTask {
  id: string;
  text: string;
  checked: boolean;
  milestoneId?: string;
  kind?: string;
  dependsOn?: string[];
  owner?: string;
  expectedOutput?: string;
  verifyCommands?: string[];
}

export function parsePlanTasks(planContent: string): ParsedPlanTask[] {
  const lines = planContent.split("\n");
  const tasks: ParsedPlanTask[] = [];

    for (const line of lines) {
      const match = line.match(/^- \[([ xX])\]\s+(.+)$/);
      if (!match) continue;
      const rawText = match[2].trim();
      const [text, ...metaParts] = rawText.split(" | ");
      const meta = new Map<string, string>();
      for (const part of metaParts) {
        const [key, ...rest] = part.split("=");
        if (!key || rest.length === 0) continue;
        meta.set(key.trim(), rest.join("=").trim());
      }
        tasks.push({
          id: `T${tasks.length + 1}`,
          checked: match[1].toLowerCase() === "x",
          text: text.trim(),
          milestoneId: meta.get("milestone"),
          kind: meta.get("kind"),
          dependsOn: meta.get("dependsOn")
            ? meta
                .get("dependsOn")!
                .split(",")
                .map(item => item.trim())
                .filter(Boolean)
            : undefined,
          owner: meta.get("owner"),
          expectedOutput: meta.get("expectedOutput"),
          verifyCommands: meta.get("verify")
            ? meta
                .get("verify")!
                .split(";;")
                .map(item => item.trim())
                .filter(Boolean)
            : undefined
        });
      }

  return tasks;
}
