/**
 * Shared primitive types used across AgentForge.
 *
 * These types have no internal dependencies and can be imported by any other module.
 */

export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | JSONSchema[];
  required?: string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  additionalProperties?: boolean | JSONSchema;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  child(context: Record<string, unknown>): Logger;
}

export type AgentEvent =
  | 'agent:init'
  | 'agent:ready'
  | 'agent:execute:start'
  | 'agent:execute:end'
  | 'agent:tool:call'
  | 'agent:tool:result'
  | 'agent:llm:chunk'
  | 'agent:llm:error'
  | 'agent:error'
  | 'agent:destroy'
  | 'agent:capability:installed'
  | 'agent:hub:connected'
  | 'agent:hub:disconnected';

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export interface AgentStreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  toolResult?: {
    name: string;
    output: unknown;
  };
  error?: { code: string; message: string };
  index: number;
  tokensUsed?: { input: number; output: number };
}

export enum AgentStatus {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  DAEMON_RUNNING = 'daemon-running',
  RUNNING = 'running',
  ERROR = 'error',
  DESTROYED = 'destroyed',
}

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema?: JSONSchema;
  outputSchema?: JSONSchema;
  riskLevel?: 'low' | 'medium' | 'high';
  sensitiveOperations?: string[];
}

export interface AgentIdentity {
  id?: string;
  name: string;
  role: string;
  version: string;
}

export type CapabilityType = 'agent' | 'tool' | 'skill' | 'plugin' | 'remote-agent';

export interface AgentError {
  code: string;
  message: string;
  details?: unknown;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface Artifact {
  type: 'file' | 'url' | 'data' | 'image';
  name: string;
  content?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  duration: number;
  status: 'success' | 'error';
  error?: string;
}

export interface AgentMetrics {
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  avgDuration: number;
  avgTokens: { input: number; output: number; total: number };
  totalTokens: { input: number; output: number; total: number };
  toolCallCounts: Record<string, number>;
  lastExecutionAt: number;
}
