import { complete } from "@doo/harness-ai";
import type { AgentEvent, AgentLoopContext } from "./types.js";

export async function runAgentLoop(
  context: AgentLoopContext,
  emit: (event: AgentEvent) => void
): Promise<void> {
  emit({ type: "agent_start" });
  const output = [...context.messages];

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const message = await complete(context.model, {
      systemPrompt: context.systemPrompt,
      messages: output,
      tools: context.tools?.map(tool => ({ name: tool.name, description: tool.description }))
    });
    emit({ type: "message_start", message });
    for (const part of message.content) {
      if (part.type === "text") {
        emit({ type: "message_update", message, delta: part.text });
      }
    }
    emit({ type: "message_end", message });

    output.push(message);

    const toolCalls = message.content.filter(part => part.type === "tool_call");
    if (toolCalls.length === 0) {
      break;
    }

    for (const part of toolCalls) {
      const tool = context.tools?.find(candidate => candidate.name === part.name);
      emit({ type: "tool_execution_start", toolCallId: part.id, toolName: part.name });
      if (!tool) {
        const missingResult = {
          role: "tool_result" as const,
          toolCallId: part.id,
          toolName: part.name,
          content: [{ type: "text" as const, text: `Tool ${part.name} not found` }],
          isError: true,
          timestamp: Date.now()
        };
        emit({
          type: "tool_execution_end",
          toolCallId: part.id,
          toolName: part.name,
          result: { content: missingResult.content, details: {} },
          isError: true
        });
        output.push(missingResult);
        continue;
      }

      try {
        const result = await tool.execute(part.id, part.arguments);
        const toolResult = {
          role: "tool_result" as const,
          toolCallId: part.id,
          toolName: part.name,
          content: result.content,
          isError: false,
          timestamp: Date.now()
        };
        emit({
          type: "tool_execution_end",
          toolCallId: part.id,
          toolName: part.name,
          result,
          isError: false
        });
        output.push(toolResult);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        const toolResult = {
          role: "tool_result" as const,
          toolCallId: part.id,
          toolName: part.name,
          content: [{ type: "text" as const, text: messageText }],
          isError: true,
          timestamp: Date.now()
        };
        emit({
          type: "tool_execution_end",
          toolCallId: part.id,
          toolName: part.name,
          result: { content: toolResult.content, details: {} },
          isError: true
        });
        output.push(toolResult);
      }
    }
  }

  emit({ type: "agent_end", messages: output });
}
