import type { IProvider, ChatParams, ChatResponse, ChatChunk, ModelConfig } from '@agentforge/types';

export abstract class BaseProvider<T extends ModelConfig = ModelConfig> implements IProvider {
  abstract readonly provider: string;
  protected readonly config: T;

  constructor(config: T) {
    this.config = config;
  }

  abstract chat(params: ChatParams): Promise<ChatResponse>;
  abstract chatStream(params: ChatParams): AsyncIterable<ChatChunk>;
  abstract validate(): Promise<boolean>;

  protected get modelName(): string {
    return this.config.modelName;
  }

  protected get baseUrl(): string | undefined {
    return this.config.baseUrl;
  }
}
