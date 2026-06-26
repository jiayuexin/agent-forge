import type {
  ChatParams,
  ChatResponse,
  ChatChunk,
  IProvider,
  ModelConfig,
} from '@agentforge/types';

export class MockProvider implements IProvider {
  readonly provider = 'mock';

  constructor(public config: ModelConfig) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const message = params.messages[params.messages.length - 1]?.content ?? '';
    return {
      content: `mock: ${message}`,
      usage: { input: 0, output: 0, total: 0 },
      model: 'mock-model',
      finishReason: 'stop',
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    const message = params.messages[params.messages.length - 1]?.content ?? '';
    yield { type: 'text', delta: `mock: ${message}` };
    yield { type: 'done' };
  }

  async validate(): Promise<boolean> {
    return true;
  }
}
