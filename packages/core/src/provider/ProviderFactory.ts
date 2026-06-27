import type { IProvider, ModelConfig } from '@agentforge/types';
import { CoreError } from '../errors.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { OllamaProvider } from './OllamaProvider.js';

export type ProviderConstructor = new (config: ModelConfig) => IProvider;

export class ProviderFactory {
  private static registry = new Map<string, ProviderConstructor>();

  static register(type: string, ctor: ProviderConstructor): void {
    this.registry.set(type, ctor);
  }

  static create(config: ModelConfig): IProvider {
    const ctor = this.registry.get(config.provider);
    if (!ctor) {
      throw new CoreError(
        'UNKNOWN_PROVIDER',
        `No provider registered for type: ${config.provider}`
      );
    }
    return new ctor(config);
  }

  static list(): string[] {
    return Array.from(this.registry.keys());
  }
}

ProviderFactory.register('openai', OpenAIProvider);
ProviderFactory.register('anthropic', AnthropicProvider);
ProviderFactory.register('ollama', OllamaProvider);
