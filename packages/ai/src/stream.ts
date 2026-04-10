import type { AssistantMessage, AssistantMessageEventStream, Context, Model } from "./types.js";
import { resolveAuthForModel } from "./auth.js";
import { completeViaPiCodexBridge } from "./pi-codex-bridge.js";

function extractLastUserText(context: Context): string {
  const lastUser = [...context.messages].reverse().find(message => message.role === "user");
  if (!lastUser) return "";
  if (typeof lastUser.content === "string") return lastUser.content;
  return lastUser.content
    .filter(part => part.type === "text")
    .map(part => part.text)
    .join("\n");
}

class StaticAssistantMessageEventStream implements AssistantMessageEventStream {
  constructor(private readonly message: AssistantMessage) {}

  async *[Symbol.asyncIterator](): AsyncIterator<import("./types.js").AssistantMessageEvent> {
    yield { type: "start", partial: this.message };
    for (const part of this.message.content) {
      if (part.type === "text" && part.text.length > 0) {
        yield { type: "text_delta", delta: part.text, partial: this.message };
      }
    }
    yield { type: "done", message: this.message };
  }

  async result(): Promise<AssistantMessage> {
    return this.message;
  }
}

class DeferredAssistantMessageEventStream implements AssistantMessageEventStream {
  private messagePromise: Promise<AssistantMessage> | null = null;

  constructor(private readonly loader: () => Promise<AssistantMessage>) {}

  private load(): Promise<AssistantMessage> {
    if (!this.messagePromise) {
      this.messagePromise = this.loader();
    }
    return this.messagePromise;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<import("./types.js").AssistantMessageEvent> {
    const message = await this.load();
    yield { type: "start", partial: message };
    for (const part of message.content) {
      if (part.type === "text" && part.text.length > 0) {
        yield { type: "text_delta", delta: part.text, partial: message };
      }
    }
    yield { type: "done", message };
  }

  async result(): Promise<AssistantMessage> {
    return this.load();
  }
}

function createToolCallMessage(name: string, args: Record<string, unknown>): AssistantMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "tool_call",
        id: `tool-${Date.now()}`,
        name,
        arguments: args
      }
    ],
    stopReason: "tool_use",
    timestamp: Date.now()
  };
}

function createToolCallsMessage(
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
): AssistantMessage {
  return {
    role: "assistant",
    content: toolCalls.map(call => ({
      type: "tool_call" as const,
      id: call.id,
      name: call.name,
      arguments: call.arguments
    })),
    stopReason: "tool_use",
    timestamp: Date.now()
  };
}

function createTextMessage(text: string, stopReason: AssistantMessage["stopReason"] = "stop", errorMessage?: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason,
    errorMessage,
    timestamp: Date.now()
  };
}

function parseExplicitToolPayload(name: string, payload: string): Record<string, unknown> {
  if (name === "bash") {
    return { command: payload.trim() };
  }
  if (name === "read") {
    return { path: payload.trim() };
  }

  const args: Record<string, unknown> = {};
  const pattern = /([a-zA-Z0-9_]+)=(".*?"|'.*?'|\S+)/g;
  for (const match of payload.matchAll(pattern)) {
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    args[key] = value;
  }
  if (Object.keys(args).length > 0) {
    return args;
  }
  return { raw: payload.trim() };
}

function planToolCallFromUserText(userText: string): AssistantMessage | null {
  const explicit = userText.match(/^tool:([a-zA-Z0-9_-]+)\s+(.+)$/s);
  if (explicit) {
    const [, name, payload] = explicit;
    return createToolCallMessage(name, parseExplicitToolPayload(name, payload));
  }

  const readMatch = userText.match(/^(?:read|show)\s+(?:file\s+)?(.+)$/i);
  if (readMatch) {
    return createToolCallMessage("read", { path: readMatch[1].trim() });
  }

  const bashMatch = userText.match(/^(?:run|bash)\s+(.+)$/i);
  if (bashMatch) {
    return createToolCallMessage("bash", { command: bashMatch[1].trim() });
  }

  const writeMatch = userText.match(/^write\s+(?:file\s+)?(\S+)\s+(?:content\s+)?(.+)$/i);
  if (writeMatch) {
    return createToolCallMessage("write", {
      path: writeMatch[1].trim(),
      content: writeMatch[2].trim()
    });
  }

  const editMatch = userText.match(/^replace\s+"([^"]+)"\s+with\s+"([^"]+)"\s+in\s+(\S+)$/i);
  if (editMatch) {
    return createToolCallMessage("edit", {
      oldText: editMatch[1],
      newText: editMatch[2],
      path: editMatch[3]
    });
  }

  return null;
}

function parseAssistantTextToMessage(text: string): AssistantMessage {
  const toolPlan = planToolCallFromUserText(text.trim());
  if (toolPlan) {
    return toolPlan;
  }
  return createTextMessage(text.trim() || "empty response");
}

function toChatMessages(context: Context): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];

  if (context.systemPrompt) {
    const toolGuidance =
      context.tools && context.tools.length > 0
        ? `\n\nIf you need to use a tool, respond with exactly one line in this format: tool:<name> <arguments>. Available tools:\n${context.tools
            .map(tool => `- ${tool.name}: ${tool.description}`)
            .join("\n")}`
        : "";
    messages.push({
      role: "system",
      content: `${context.systemPrompt}${toolGuidance}`
    });
  }

  for (const message of context.messages) {
    if (message.role === "user") {
      messages.push({
        role: "user",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter(part => part.type === "text")
                .map(part => part.text)
                .join("\n")
      });
      continue;
    }

    if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: message.content
          .map(part =>
            part.type === "text"
              ? part.text
              : `tool:${part.name} ${JSON.stringify(part.arguments)}`
          )
          .join("\n")
      });
      continue;
    }

    messages.push({
      role: "user",
      content: `Tool result (${message.toolName}): ${message.content.map(part => part.text).join("\n")}`
    });
  }

  return messages;
}

function toOpenAICompatibleTools(context: Context): Array<Record<string, unknown>> | undefined {
  if (!context.tools || context.tools.length === 0) {
    return undefined;
  }

  return context.tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        additionalProperties: true
      }
    }
  }));
}

function isResponsesStylePath(model: Model): boolean {
  return model.provider === "openai-codex" || (model.apiPath ?? "").includes("/responses");
}

function toResponsesInput(context: Context): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];

  if (context.systemPrompt) {
    input.push({
      role: "system",
      content: [{ type: "input_text", text: context.systemPrompt }]
    });
  }

  for (const message of context.messages) {
    if (message.role === "user") {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter(part => part.type === "text")
              .map(part => part.text)
              .join("\n");
      input.push({
        role: "user",
        content: [{ type: "input_text", text }]
      });
      continue;
    }

    if (message.role === "assistant") {
      const text = message.content
        .map(part =>
          part.type === "text"
            ? part.text
            : `tool:${part.name} ${JSON.stringify(part.arguments)}`
        )
        .join("\n");
      input.push({
        role: "assistant",
        content: [{ type: "output_text", text }]
      });
      continue;
    }

    input.push({
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Tool result (${message.toolName}): ${message.content.map(part => part.text).join("\n")}`
        }
      ]
    });
  }

  return input;
}

function parseToolCallArguments(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall back to raw payload
  }

  return { raw };
}

async function completeOpenAICompatible(model: Model, context: Context): Promise<AssistantMessage> {
  if (model.provider === "openai-codex" && (model.authSource ?? "pi-auth") === "pi-auth" && !model.baseUrl) {
    return completeViaPiCodexBridge(model, context);
  }

  const baseUrl =
    model.baseUrl ?? (model.provider === "openai-codex" ? "https://chatgpt.com/backend-api" : undefined);
  if (!baseUrl) {
    return createTextMessage("openai-compatible model is missing baseUrl", "error", "missing baseUrl");
  }

  const resolvedAuth = await resolveAuthForModel(model);
  const apiKey = resolvedAuth.apiKey;
  if (!apiKey) {
    return createTextMessage(
      resolvedAuth.source === "pi-auth"
        ? `Missing OAuth credentials in: ${resolvedAuth.credentialLocation}`
        : `Missing API key environment variable: ${resolvedAuth.envVar}`,
      "error",
      resolvedAuth.source === "pi-auth"
        ? `missing oauth credentials: ${resolvedAuth.credentialLocation}`
        : `missing api key: ${resolvedAuth.envVar}`
    );
  }

  const apiKeyHeaderName = resolvedAuth.authHeaderName;
  const apiKeyPrefix = resolvedAuth.authPrefix ? `${resolvedAuth.authPrefix} ` : "";
  const useResponsesStyle = isResponsesStylePath(model);
  const response = await fetch(
    new URL(
      model.apiPath ??
        (model.provider === "openai-codex"
          ? "/codex/responses"
          : "/v1/chat/completions"),
      baseUrl
    ),
    {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [apiKeyHeaderName]: `${apiKeyPrefix}${apiKey}`,
      ...(resolvedAuth.extraHeaders ?? {}),
      ...(model.headers ?? {})
    },
    body: JSON.stringify(
      useResponsesStyle
        ? {
            model: model.id,
            input: toResponsesInput(context),
            temperature: model.temperature ?? 0,
            max_output_tokens: model.maxTokens,
            tools: toOpenAICompatibleTools(context)
          }
        : {
            model: model.id,
            messages: toChatMessages(context),
            temperature: model.temperature ?? 0,
            max_tokens: model.maxTokens,
            tools: toOpenAICompatibleTools(context)
          }
    )
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return createTextMessage(
      `Provider request failed: ${response.status} ${response.statusText}`,
      "error",
      errorText
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: {
            name?: string;
            arguments?: string;
          };
        }>;
      };
    }>;
    output_text?: string;
    output?: Array<{
      type?: string;
      text?: string;
      content?: Array<{ type?: string; text?: string }>;
      id?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }>;
  };

  if (typeof json.output_text === "string") {
    return parseAssistantTextToMessage(json.output_text);
  }

  if (json.output && json.output.length > 0) {
    const functionCalls = json.output.filter(item => item.type === "function_call");
    if (functionCalls.length > 0) {
      return createToolCallsMessage(
        functionCalls.map((item, index) => ({
          id: item.call_id ?? item.id ?? `tool-${Date.now()}-${index}`,
          name: item.name ?? "unknown_tool",
          arguments: parseToolCallArguments(item.arguments)
        }))
      );
    }

    const outputText = json.output
      .flatMap(item => {
        if (typeof item.text === "string") {
          return [item.text];
        }
        if (item.content) {
          return item.content
            .filter(part => part.type === "output_text" || part.type === "text")
            .map(part => part.text ?? "")
            .filter(Boolean);
        }
        return [];
      })
      .join("\n")
      .trim();

    if (outputText) {
      return parseAssistantTextToMessage(outputText);
    }
  }

  const choice = json.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    return createToolCallsMessage(
      toolCalls.map((toolCall, index) => ({
        id: toolCall.id ?? `tool-${Date.now()}-${index}`,
        name: toolCall.function?.name ?? "unknown_tool",
        arguments: parseToolCallArguments(toolCall.function?.arguments)
      }))
    );
  }
  const content = choice?.message?.content ?? "";
  return parseAssistantTextToMessage(content);
}

export function stream(_model: Model, _context: Context): AssistantMessageEventStream {
  if (
    _model.provider === "openai-compatible" ||
    _model.provider === "openai-codex" ||
    _model.provider === "openai" ||
    _model.provider === "openrouter" ||
    _model.provider === "groq" ||
    _model.provider === "xai" ||
    _model.provider === "cerebras" ||
    _model.provider === "mistral"
  ) {
    return new DeferredAssistantMessageEventStream(() => completeOpenAICompatible(_model, _context));
  }

  const userText = extractLastUserText(_context).trim();
  const toolPlan = planToolCallFromUserText(userText);
  if (toolPlan) {
    return new StaticAssistantMessageEventStream(toolPlan);
  }

  return new StaticAssistantMessageEventStream(createTextMessage("stub response"));
}

export async function complete(model: Model, context: Context): Promise<AssistantMessage> {
  return stream(model, context).result();
}
