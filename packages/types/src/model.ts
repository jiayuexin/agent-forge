import type { ProviderType } from './config.js';

/**
 * Model registry and multi-endpoint routing types.
 */

export interface ModelEndpoint {
  id: string;
  baseUrl: string;
  provider: ProviderType | string;
  apiKey?: string;
  extra?: Record<string, unknown>;
  models: string[];
}

export interface ModelRegistry {
  endpoints: ModelEndpoint[];
  defaultEndpoint?: string;
  defaultModel?: string;
}

export interface ModelRef {
  model: string;
  endpoint?: string;
}
