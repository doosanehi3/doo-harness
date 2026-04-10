import type { AssistantMessage, Message, Model } from "@doo/harness-ai";

export type ThinkingLevel = "off" | "low" | "medium" | "high";

export interface AgentToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
}

export interface AgentTool {
  name: string;
  description: string;
  execute(
    toolCallId: string,
    input: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<AgentToolResult>;
}

export interface AgentState {
  systemPrompt: string;
  model: Model;
  thinkingLevel: ThinkingLevel;
  messages: Message[];
  tools: AgentTool[];
  isStreaming: boolean;
  errorMessage?: string;
}

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: Message[] }
  | { type: "message_start"; message: Message }
  | { type: "message_end"; message: Message }
  | { type: "message_update"; message: AssistantMessage; delta: string }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: AgentToolResult; isError: boolean };

export interface AgentLoopContext {
  systemPrompt?: string;
  messages: Message[];
  tools?: AgentTool[];
  model: Model;
}
