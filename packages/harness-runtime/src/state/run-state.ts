import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RunState } from "../phases/types.js";

export async function loadRunState(path: string, fallback: RunState): Promise<RunState> {
  try {
    const raw = await readFile(path, "utf8");
    return {
      ...fallback,
      ...JSON.parse(raw),
      updatedAt: new Date().toISOString()
    };
  } catch {
    return fallback;
  }
}

export async function saveRunState(path: string, state: RunState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}
