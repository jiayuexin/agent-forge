import type { Message } from './core.js';
import type { ToolDefinition } from './tool.js';

/**
 * LLM provider adapter contract and chat types.
 */

export interface IProvider {
  readonly provider: string;
  chat(params: ChatParams): Promise<ChatResponse>;
  chatStream(params: ChatParams): AsyncIterable<ChatChunk>;
  validate(): Promise<boolean>;
}

export interface ChatParams {
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  timeout?: number;
  traceId?: string;
}

export interface ChatResponse {
  content: string;
  structured?: Record<string, unknown>;
  toolCalls?: ToolCallRequest[];
  usage: { input: number; output: number; total: number };
  model: string;
  finishReason: string;
}

export interface ChatChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  delta?: string;
  toolCallDelta?: {
    index: number;
    name?: string;
    argsDelta?: string;
  };
  toolCall?: ToolCallRequest;
  toolResult?: { name: string; output: unknown };
  usage?: { input: number; output: number; total: number };
  finishReason?: string;
  error?: { code: string; message: string };
}

export interface ToolCallRequest {
  name: string;
  args: Record<string, unknown>;
  callId: string;
}
