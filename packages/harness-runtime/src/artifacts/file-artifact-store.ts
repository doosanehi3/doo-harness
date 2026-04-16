import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactMeta, ArtifactType } from "./types.js";
import type { ArtifactStore } from "./artifact-store.js";

const DEFAULT_PATHS: Record<ArtifactType, string> = {
  goal_summary: "goal-summary.md",
  spec: "spec.md",
  plan: "plan.md",
  milestones: "milestones.md",
  task_state: "task-state.json",
  verification: "verifications",
  review: "reviews",
  handoff: "handoffs",
  note: "notes"
};

function artifactFilename(type: ArtifactType): string {
  const stamp = new Date().toISOString().replace(/[:]/g, "-");
  return `${stamp}.md`;
}

function compareArtifactRecency(left: ArtifactMeta, right: ArtifactMeta): number {
  const updated = right.updatedAt.localeCompare(left.updatedAt);
  if (updated !== 0) {
    return updated;
  }
  const created = right.createdAt.localeCompare(left.createdAt);
  if (created !== 0) {
    return created;
  }
  return right.path.localeCompare(left.path);
}

export class FileArtifactStore implements ArtifactStore {
  constructor(private readonly rootDir: string) {}

  async write(type: ArtifactType, content: string, sessionId: string, relativePath?: string): Promise<ArtifactMeta> {
    const defaultPath = DEFAULT_PATHS[type];
    const targetPath =
      relativePath ??
      (type === "verification" || type === "review" || type === "handoff" || type === "note"
        ? join(defaultPath, artifactFilename(type))
        : defaultPath);

    const absolutePath = join(this.rootDir, targetPath);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, content, "utf8");

    const now = new Date().toISOString();
    return {
      id: `${type}-${now}`,
      type,
      path: absolutePath,
      sessionId,
      createdAt: now,
      updatedAt: now
    };
  }

  async read(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async list(sessionId: string): Promise<ArtifactMeta[]> {
    const metas: ArtifactMeta[] = [];
    for (const [type, target] of Object.entries(DEFAULT_PATHS) as Array<[ArtifactType, string]>) {
      const absolute = join(this.rootDir, target);
      if (!existsSync(absolute)) {
        continue;
      }

      if (type === "verification" || type === "review" || type === "handoff" || type === "note") {
        const entries = await readdir(absolute, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const filePath = join(absolute, entry.name);
          const meta = await stat(filePath);
          metas.push({
            id: `${type}-${entry.name}`,
            type,
            path: filePath,
            sessionId,
            createdAt: meta.birthtime.toISOString(),
            updatedAt: meta.mtime.toISOString()
          });
        }
      } else {
        const meta = await stat(absolute);
        metas.push({
          id: `${type}-${target}`,
          type,
          path: absolute,
          sessionId,
          createdAt: meta.birthtime.toISOString(),
          updatedAt: meta.mtime.toISOString()
        });
      }
    }
    return metas.sort(compareArtifactRecency);
  }

  async latest(sessionId: string, type: ArtifactType): Promise<ArtifactMeta | null> {
    const metas = (await this.list(sessionId)).filter(meta => meta.type === type);
    return metas.length === 0 ? null : metas[0];
  }
}
