import type { JSONSchema } from './core.js';

/**
 * Debug and testing helper types.
 */

export interface DebugConfig {
  provider?: 'openai' | 'anthropic' | 'ollama';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  enabledTools?: string[];
  disabledTools?: string[];
  variables?: Record<string, string>;
  injectTools?: InjectedTool[];
  mockTools?: Record<string, MockToolConfig>;
}

export interface InjectedTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  handler: string;
}

export interface MockToolConfig {
  mode: 'once' | 'always' | 'sequence' | 'error';
  response?: unknown;
  responses?: unknown[];
  error?: string;
  latency?: number;
}

export interface CallTrace {
  id: string;
  timestamp: number;
  type: 'system_prompt' | 'llm_call' | 'tool_call' | 'output_parse';
  input: unknown;
  output: unknown;
  duration: number;
  tokens?: { input: number; output: number; total: number };
  status: 'success' | 'error';
  error?: string;
}
