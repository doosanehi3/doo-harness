import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool
} from "../packages/agent-core/src/index.js";

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "doo-tools-"));
}

test("write tool creates a file and read tool reads it", async () => {
  const cwd = await createTempDir();
  try {
    const writeTool = createWriteTool(cwd);
    const readTool = createReadTool(cwd);

    await writeTool.execute("1", { path: "notes/todo.txt", content: "hello world" });
    const result = await readTool.execute("2", { path: "notes/todo.txt" });

    assert.equal(result.content[0]?.text, "hello world");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("edit tool replaces text in a file", async () => {
  const cwd = await createTempDir();
  try {
    const filePath = join(cwd, "file.txt");
    await writeFile(filePath, "alpha beta", "utf8");
    const editTool = createEditTool(cwd);

    await editTool.execute("1", {
      path: "file.txt",
      oldText: "beta",
      newText: "gamma"
    });

    const updated = await readFile(filePath, "utf8");
    assert.equal(updated, "alpha gamma");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bash tool runs a shell command in cwd", async () => {
  const cwd = await createTempDir();
  try {
    const bashTool = createBashTool(cwd);
    const result = await bashTool.execute("1", {
      command: "printf 'ok'"
    });

    assert.equal(result.content[0]?.text, "ok");
    assert.equal((result.details as { exitCode: number | null }).exitCode, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
