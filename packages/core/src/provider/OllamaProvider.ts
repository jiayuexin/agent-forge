import {
  Ollama,
  type ChatRequest as OllamaChatRequest,
  type Message as OllamaMessage,
} from 'ollama';
import type {
  ChatParams,
  ChatResponse,
  ChatChunk,
  IProvider,
  Message,
  ModelConfig,
  OllamaModelConfig,
} from '@agentforge/types';
import { CoreError } from '../errors.js';

export class OllamaProvider implements IProvider {
  readonly provider = 'ollama';
  private client: Ollama;
  private config: OllamaModelConfig;

  constructor(config: ModelConfig) {
    if (config.provider !== 'ollama') {
      throw new Error('OllamaProvider requires provider: ollama');
    }
    this.config = config as OllamaModelConfig;
    this.client = new Ollama({ host: this.config.baseUrl });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    assertToolFieldsSupported(params);
    const request = {
      model: this.config.modelName,
      messages: params.messages.map(toOllamaMessage),
      options: {
        temperature: params.temperature,
        stop: params.stop,
      },
    } satisfies OllamaChatRequest & { stream?: false };

    const response = await this.client.chat(request);

    return {
      content: response.message.content,
      usage: {
        input: response.prompt_eval_count,
        output: response.eval_count,
        total: response.prompt_eval_count + response.eval_count,
      },
      model: response.model,
      finishReason: 'stop',
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    assertToolFieldsSupported(params);
    const request = {
      model: this.config.modelName,
      messages: params.messages.map(toOllamaMessage),
      options: {
        temperature: params.temperature,
        stop: params.stop,
      },
      stream: true,
    } satisfies OllamaChatRequest & { stream: true };

    const stream = await this.client.chat(request);

    for await (const chunk of stream) {
      if (chunk.message.content) {
        yield { type: 'text', delta: chunk.message.content };
      }
      if (chunk.done) {
        yield { type: 'done' };
      }
    }
  }

  async validate(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }
}

function assertToolFieldsSupported(params: ChatParams): void {
  const hasToolMessages = params.messages.some(
    (message) => message.role === 'tool' || Boolean(message.toolCalls?.length)
  );
  if (hasToolMessages) {
    throw new CoreError(
      'UNSUPPORTED_OLLAMA_TOOLS',
      'Installed Ollama SDK 0.5 does not support tool definitions or tool messages'
    );
  }
}

function toOllamaMessage(message: Message): OllamaMessage {
  return { role: message.role, content: message.content };
}
