import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type BridgePayload = {
  modelId: string;
  authStoragePath: string;
  piMonoRoot: string;
  context: {
    systemPrompt?: string;
    tools?: Array<{ name: string; description: string }>;
    messages: Array<{
      role: "user" | "assistant" | "tool_result";
      content: unknown;
      toolCallId?: string;
      toolName?: string;
      timestamp: number;
    }>;
  };
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
};

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function convertMessages(messages: BridgePayload["context"]["messages"]) {
  return messages.map(message => {
    if (message.role === "tool_result") {
      return {
        role: "toolResult" as const,
        toolCallId: message.toolCallId ?? "tool-call",
        toolName: message.toolName ?? "tool",
        content: [{ type: "text" as const, text: JSON.stringify(message.content) }],
        isError: false,
        timestamp: message.timestamp
      };
    }

    return {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp
    };
  });
}

async function main() {
  const payload = JSON.parse(await readStdin()) as BridgePayload;
  const aiRoot = join(payload.piMonoRoot, "packages", "ai", "src");
  const [{ getModel, completeSimple }, { getOAuthApiKey }] = await Promise.all([
    import(join(aiRoot, "index.ts")),
    import(join(aiRoot, "utils", "oauth", "index.ts"))
  ]);

  const authRaw = readFileSync(payload.authStoragePath, "utf8");
  const auth = JSON.parse(authRaw) as Record<string, { type: string; [key: string]: unknown }>;
  const oauthCredentials: Record<string, Record<string, unknown>> = {};
  for (const [provider, value] of Object.entries(auth)) {
    if (value.type === "oauth") {
      const { type: _type, ...creds } = value;
      oauthCredentials[provider] = creds;
    }
  }

  const oauthResult = await getOAuthApiKey("openai-codex", oauthCredentials);
  if (!oauthResult) {
    throw new Error(`No openai-codex OAuth credential found in ${payload.authStoragePath}`);
  }

  auth["openai-codex"] = { type: "oauth", ...oauthResult.newCredentials };
  writeFileSync(payload.authStoragePath, JSON.stringify(auth, null, 2) + "\n", "utf8");

  const model = getModel("openai-codex", payload.modelId);
  const message = await completeSimple(
    model,
    {
      systemPrompt: payload.context.systemPrompt,
      messages: convertMessages(payload.context.messages),
      tools: payload.context.tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          additionalProperties: true
        }
      }))
    },
    {
      apiKey: oauthResult.apiKey,
      temperature: payload.options?.temperature,
      maxTokens: payload.options?.maxTokens
    }
  );

  const converted = {
    role: "assistant" as const,
    content: message.content
      .map(part => {
        if (part.type === "toolCall") {
          return {
            type: "tool_call" as const,
            id: part.id,
            name: part.name,
            arguments: part.arguments
          };
        }
        if (part.type === "text") {
          return {
            type: "text" as const,
            text: part.text
          };
        }
        return null;
      })
      .filter(Boolean),
    stopReason:
      message.stopReason === "toolUse"
        ? ("tool_use" as const)
        : message.stopReason === "error" || message.stopReason === "aborted"
          ? ("error" as const)
          : ("stop" as const),
    errorMessage: message.errorMessage,
    timestamp: message.timestamp
  };

  process.stdout.write(`${JSON.stringify(converted)}\n`);
}

main().catch(error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
