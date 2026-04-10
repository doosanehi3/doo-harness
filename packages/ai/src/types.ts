export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolCallContent {
  type: "tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type AssistantContent = TextContent | ToolCallContent;

export interface UserMessage {
  role: "user";
  content: string | TextContent[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContent[];
  stopReason: "stop" | "tool_use" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

export interface ToolResultMessage {
  role: "tool_result";
  toolCallId: string;
  toolName: string;
  content: TextContent[];
  isError: boolean;
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface Model {
  id: string;
  provider: string;
  name: string;
  reasoning: boolean;
  authSource?: "env" | "pi-auth";
  oauthProviderId?: string;
  authStoragePath?: string;
  piMonoRoot?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
  apiPath?: string;
  apiKeyEnvVar?: string;
  apiKeyHeaderName?: string;
  apiKeyPrefix?: string;
  headers?: Record<string, string>;
}

export interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Array<{ name: string; description: string }>;
}

export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_delta"; delta: string; partial: AssistantMessage }
  | { type: "done"; message: AssistantMessage }
  | { type: "error"; error: AssistantMessage };

export interface AssistantMessageEventStream extends AsyncIterable<AssistantMessageEvent> {
  result(): Promise<AssistantMessage>;
}
