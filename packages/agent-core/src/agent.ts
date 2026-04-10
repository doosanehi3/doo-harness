import type { Message, Model } from "@doo/harness-ai";
import { runAgentLoop } from "./agent-loop.js";
import type { AgentEvent, AgentState, AgentTool, ThinkingLevel } from "./types.js";

export interface AgentOptions {
  model: Model;
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
  tools?: AgentTool[];
  messages?: Message[];
}

export class Agent {
  private listeners = new Set<(event: AgentEvent) => void>();
  readonly state: AgentState;

  constructor(options: AgentOptions) {
    this.state = {
      systemPrompt: options.systemPrompt ?? "",
      model: options.model,
      thinkingLevel: options.thinkingLevel ?? "off",
      messages: options.messages ?? [],
      tools: options.tools ?? [],
      isStreaming: false
    };
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async prompt(message: Message): Promise<void> {
    this.state.messages = [...this.state.messages, message];
    this.state.isStreaming = true;
    await runAgentLoop(
      {
        systemPrompt: this.state.systemPrompt,
        messages: this.state.messages,
        model: this.state.model,
        tools: this.state.tools
      },
      event => {
        if (event.type === "agent_end") {
          this.state.messages = event.messages;
          this.state.isStreaming = false;
        }
        for (const listener of this.listeners) {
          listener(event);
        }
      }
    );
  }
}
