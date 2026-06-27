import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../ProviderFactory.js';
import { MockProvider } from '../MockProvider.js';

describe('ProviderFactory', () => {
  it('creates a registered provider', () => {
    ProviderFactory.register('mock', MockProvider);
    const provider = ProviderFactory.create({
      provider: 'mock',
      modelName: 'test',
    });

    expect(provider.provider).toBe('mock');
  });

  it('creates built-in providers', () => {
    expect(ProviderFactory.list()).toContain('openai');
    expect(ProviderFactory.list()).toContain('anthropic');
    expect(ProviderFactory.list()).toContain('ollama');
  });

  it('throws for unknown provider', () => {
    expect(() =>
      ProviderFactory.create({
        provider: 'unknown',
        modelName: 'test',
      })
    ).toThrow('No provider registered for type: unknown');
  });
});
