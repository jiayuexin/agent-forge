import type {
  ModelConfig,
  ModelEndpoint,
  ModelRef,
  ModelRegistry as ModelRegistryData,
} from '@agentforge/types';
import { ModelNotFoundError } from './errors.js';

export class ModelRegistry {
  private data: ModelRegistryData;

  constructor(data?: ModelRegistryData) {
    this.data = data ?? { endpoints: [] };
  }

  resolve(model?: string | ModelRef, pipelineDefaultModel?: string): ModelConfig {
    let resolved: { endpoint: ModelEndpoint; modelName: string } | undefined;

    if (typeof model === 'object' && model !== null) {
      const endpoint = this.findEndpointById(model.endpoint);
      if (!endpoint) {
        throw new ModelNotFoundError(`${model.endpoint}/${model.model}`);
      }
      resolved = { endpoint, modelName: model.model };
    } else if (typeof model === 'string') {
      resolved = this.findEndpointByModel(model);
    }

    if (!resolved && pipelineDefaultModel) {
      resolved = this.findEndpointByModel(pipelineDefaultModel);
    }

    if (!resolved && this.data.defaultModel) {
      resolved = this.findEndpointByModel(this.data.defaultModel);
      if (!resolved && this.data.defaultEndpoint) {
        const endpoint = this.findEndpointById(this.data.defaultEndpoint);
        if (endpoint) {
          resolved = { endpoint, modelName: this.data.defaultModel };
        }
      }
    }

    if (!resolved) {
      throw new ModelNotFoundError(
        typeof model === 'string' ? model : model?.model ?? pipelineDefaultModel ?? this.data.defaultModel
      );
    }

    return this.toModelConfig(resolved.endpoint, resolved.modelName);
  }

  private findEndpointById(id?: string): ModelEndpoint | undefined {
    if (!id) return undefined;
    return this.data.endpoints.find((e) => e.id === id);
  }

  private findEndpointByModel(model: string): { endpoint: ModelEndpoint; modelName: string } | undefined {
    const endpoint = this.data.endpoints.find((e) => e.models.includes(model));
    return endpoint ? { endpoint, modelName: model } : undefined;
  }

  private toModelConfig(endpoint: ModelEndpoint, modelName: string): ModelConfig {
    const base = {
      modelName,
      apiKey: endpoint.apiKey ?? '',
      baseUrl: endpoint.baseUrl,
      ...endpoint.extra,
    };

    switch (endpoint.provider) {
      case 'openai':
        return { provider: 'openai', ...base } as ModelConfig;
      case 'anthropic':
        return { provider: 'anthropic', ...base } as ModelConfig;
      case 'ollama':
        return { provider: 'ollama', modelName, baseUrl: endpoint.baseUrl, ...endpoint.extra } as ModelConfig;
      default:
        return { provider: endpoint.provider, extra: endpoint.extra, ...base } as ModelConfig;
    }
  }
}
