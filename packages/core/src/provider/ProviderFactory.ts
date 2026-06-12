import type { ModelConfig } from '@agentforge/types';
import type { IProvider } from './IProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OllamaProvider } from './OllamaProvider';

type ProviderConstructor = new (config: any) => IProvider; // eslint-disable-line @typescript-eslint/no-explicit-any -- needed for generic registry

export class ProviderFactory {
  private static readonly registry = new Map<string, ProviderConstructor>();

  static register(provider: string, ctor: ProviderConstructor): void {
    ProviderFactory.registry.set(provider, ctor);
  }

  static create(config: ModelConfig): IProvider {
    const Ctor = ProviderFactory.registry.get(config.provider);
    if (!Ctor) {
      throw new Error(`Unknown provider: ${config.provider}`);
    }
    return new Ctor(config);
  }
}

// Auto-register built-in providers
ProviderFactory.register('openai', OpenAIProvider as ProviderConstructor);
ProviderFactory.register('anthropic', AnthropicProvider as ProviderConstructor);
ProviderFactory.register('ollama', OllamaProvider as ProviderConstructor);
