export interface ParsedMilestone {
  id: string;
  text: string;
  kind?: string;
  dependsOn?: string[];
}

export function parseMilestones(content: string): ParsedMilestone[] {
  const milestones: ParsedMilestone[] = [];

  for (const line of content.split("\n")) {
    const match = line.match(/^- (M\d+):\s+(.+)$/);
    if (!match) continue;
    const rawText = match[2].trim();
    const [text, ...metaParts] = rawText.split(" | ");
    const meta = new Map<string, string>();
    for (const part of metaParts) {
      const [key, ...rest] = part.split("=");
      if (!key || rest.length === 0) continue;
      meta.set(key.trim(), rest.join("=").trim());
    }
    milestones.push({
      id: match[1],
      text: text.trim(),
      kind: meta.get("kind"),
      dependsOn: meta.get("dependsOn")?.split(",").map(item => item.trim()).filter(Boolean)
    });
  }

  return milestones;
}
