import type { ArtifactMeta, ArtifactType } from "./types.js";

export interface ArtifactStore {
  write(type: ArtifactType, content: string, sessionId: string, relativePath?: string): Promise<ArtifactMeta>;
  read(path: string): Promise<string>;
  list(sessionId: string): Promise<ArtifactMeta[]>;
  latest(sessionId: string, type: ArtifactType): Promise<ArtifactMeta | null>;
}
