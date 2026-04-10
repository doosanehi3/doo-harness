import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AssistantMessage, Context, Model } from "./types.js";
import { getDefaultPiAuthPath } from "./auth.js";

function getDefaultPiMonoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../../../pi-mono");
}

export async function completeViaPiCodexBridge(model: Model, context: Context): Promise<AssistantMessage> {
  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "pi-codex-bridge-script.mts");
  const payload = JSON.stringify({
    modelId: model.id,
    authStoragePath: model.authStoragePath ?? getDefaultPiAuthPath(),
    piMonoRoot: model.piMonoRoot ?? getDefaultPiMonoRoot(),
    context: {
      ...context,
      tools: context.tools
    },
    options: {
      temperature: model.temperature,
      maxTokens: model.maxTokens
    }
  });

  return new Promise<AssistantMessage>((resolvePromise) => {
    const child = spawn(
      "npx",
      ["--yes", "tsx", scriptPath],
      {
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", error => {
      resolvePromise({
        role: "assistant",
        content: [{ type: "text", text: "pi-codex bridge failed to start" }],
        stopReason: "error",
        errorMessage: error.message,
        timestamp: Date.now()
      });
    });
    child.on("close", code => {
      if (code !== 0) {
        resolvePromise({
          role: "assistant",
          content: [{ type: "text", text: `pi-codex bridge failed: ${stderr.trim() || `exit ${code}`}` }],
          stopReason: "error",
          errorMessage: stderr.trim() || `exit ${code}`,
          timestamp: Date.now()
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim()) as AssistantMessage;
        resolvePromise(parsed);
      } catch (error) {
        resolvePromise({
          role: "assistant",
          content: [{ type: "text", text: "pi-codex bridge returned invalid JSON" }],
          stopReason: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        });
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}
