/** @see docs/01-核心设计.md §1.2 */

import type { JSONSchema } from './debug';

export type ProviderType = 'openai' | 'anthropic' | 'ollama';

export interface BaseModelParams {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface OpenAIModelConfig extends BaseModelParams {
  provider: 'openai';
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

export interface AnthropicModelConfig extends BaseModelParams {
  provider: 'anthropic';
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  anthropicVersion?: string;
}

export interface OllamaModelConfig extends BaseModelParams {
  provider: 'ollama';
  modelName: string;
  baseUrl?: string;
}

export interface CustomModelConfig extends BaseModelParams {
  provider: string;
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any — intentional for extensibility
}

export type ModelConfig =
  | OpenAIModelConfig
  | AnthropicModelConfig
  | OllamaModelConfig
  | CustomModelConfig;

/** 工具定义 — Agent 可调用的工具,映射到各 Provider 的 Function Calling 格式 */
export interface ToolDefinition {
  /** 工具名,使用 kebab-case(如 query-order, create-refund) */
  name: string;
  /** 工具描述(供 LLM 理解何时调用) */
  description: string;
  /** 参数 JSON Schema */
  parameters: JSONSchema;
  /** 是否为必须工具(无论 LLM 是否主动调用都注入到 system prompt) */
  required?: boolean;
}

/** 中间件配置 */
export interface MiddlewareConfig {
  /** 中间件名 */
  name: string;
  /** 启用/禁用 */
  enabled?: boolean;
  /** 中间件选项 */
  options?: Record<string, unknown>;
}

export interface AgentConfig {
  model: ModelConfig;
  systemPrompt: string;
  tools?: ToolDefinition[];
  middlewares?: MiddlewareConfig[];
  custom?: Record<string, unknown>;
}
