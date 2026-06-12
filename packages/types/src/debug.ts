/** @see docs/01-核心设计.md §1.9 */

/** JSON Schema 定义 — 统一拼写为 JSONSchema(非 JsonSchema) */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | JSONSchema[];
  required?: string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  additionalProperties?: boolean | JSONSchema;
  [key: string]: unknown; // 允许 $ref, allOf, anyOf, oneOf 等 JSON Schema 扩展
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

export interface CallTrace {
  id: string;
  timestamp: number;
  type: 'system_prompt' | 'llm_call' | 'tool_call' | 'output_parse';
  input: unknown;
  output: unknown;
  duration: number;
  tokens?: { prompt: number; completion: number };
  status: 'success' | 'error';
  error?: string;
}
