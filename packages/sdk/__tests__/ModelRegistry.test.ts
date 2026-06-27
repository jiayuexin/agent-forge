import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../src/ModelRegistry.js';
import { ModelNotFoundError } from '../src/errors.js';
import type { ModelRegistry as ModelRegistryData } from '@agentforge/types';

const registryData: ModelRegistryData = {
  endpoints: [
    {
      id: 'openai-endpoint',
      baseUrl: 'https://api.openai.com',
      provider: 'openai',
      apiKey: 'openai-key',
      models: ['gpt-4', 'gpt-3.5'],
    },
    {
      id: 'anthropic-endpoint',
      baseUrl: 'https://api.anthropic.com',
      provider: 'anthropic',
      apiKey: 'anthropic-key',
      models: ['claude-3'],
    },
  ],
  defaultEndpoint: 'openai-endpoint',
  defaultModel: 'gpt-3.5',
};

describe('ModelRegistry', () => {
  it('resolves a ModelRef with explicit endpoint', () => {
    const registry = new ModelRegistry(registryData);
    const config = registry.resolve({ model: 'claude-3', endpoint: 'anthropic-endpoint' });
    expect(config).toMatchObject({ provider: 'anthropic', modelName: 'claude-3' });
  });

  it('resolves a model string by finding the first matching endpoint', () => {
    const registry = new ModelRegistry(registryData);
    const config = registry.resolve('claude-3');
    expect(config).toMatchObject({ provider: 'anthropic', modelName: 'claude-3' });
  });

  it('falls back to pipeline default model', () => {
    const registry = new ModelRegistry(registryData);
    const config = registry.resolve(undefined, 'gpt-4');
    expect(config).toMatchObject({ provider: 'openai', modelName: 'gpt-4' });
  });

  it('falls back to registry default model', () => {
    const registry = new ModelRegistry({
      endpoints: registryData.endpoints,
      defaultModel: 'gpt-4',
    });
    const config = registry.resolve();
    expect(config).toMatchObject({ provider: 'openai', modelName: 'gpt-4' });
  });

  it('uses default endpoint when default model is not in any endpoint list', () => {
    const registry = new ModelRegistry({
      endpoints: registryData.endpoints,
      defaultEndpoint: 'anthropic-endpoint',
      defaultModel: 'unknown-model',
    });
    const config = registry.resolve();
    expect(config).toMatchObject({ provider: 'anthropic', modelName: 'unknown-model' });
  });

  it('throws ModelNotFoundError when no model can be resolved', () => {
    const registry = new ModelRegistry({ endpoints: [] });
    expect(() => registry.resolve('missing')).toThrow(ModelNotFoundError);
  });
});
