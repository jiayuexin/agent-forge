import type { AgentCapability, AgentIdentity } from './core.js';
import type { ModelRegistry } from './model.js';
import type { ToolDefinition } from './tool.js';

/**
 * Model provider and agent configuration types.
 */

export type ProviderType = 'openai' | 'anthropic' | 'ollama';

export interface BaseModelParams {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface OpenAIModelConfig extends BaseModelParams {
  provider: Extract<ProviderType, 'openai'>;
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

export interface AnthropicModelConfig extends BaseModelParams {
  provider: Extract<ProviderType, 'anthropic'>;
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  anthropicVersion?: string;
}

export interface OllamaModelConfig extends BaseModelParams {
  provider: Extract<ProviderType, 'ollama'>;
  modelName: string;
  baseUrl?: string;
}

export interface CustomModelConfig extends BaseModelParams {
  provider: string;
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export type ModelConfig =
  | OpenAIModelConfig
  | AnthropicModelConfig
  | OllamaModelConfig
  | CustomModelConfig;

export interface MiddlewareConfig {
  name: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export interface AgentConfig {
  identity: AgentIdentity;
  model: ModelConfig;
  systemPrompt: string;
  capabilities?: AgentCapability[];
  tools?: ToolDefinition[];
  middlewares?: MiddlewareConfig[];
  custom?: Record<string, unknown>;
}

export interface FrameworkConfig {
  modelRegistry?: ModelRegistry;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  outputDir?: string;
  maxTokensPerExec?: number;
  maxTokensPerModel?: Record<string, number>;
  maxCostPerAgent?: Record<string, number>;
  maxToolCalls?: number;
  onError?: (error: import('./core.js').AgentError) => void;
}
