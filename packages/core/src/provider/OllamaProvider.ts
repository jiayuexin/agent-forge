import { Ollama } from 'ollama';
import type {
  ChatParams,
  ChatResponse,
  ChatChunk,
  IProvider,
  ModelConfig,
  OllamaModelConfig,
  ToolCallRequest,
  ToolDefinition,
} from '@agentforge/types';

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
    const request = {
      model: this.config.modelName,
      messages: params.messages.map(toOllamaMessage),
      tools: params.tools?.map(toOllamaTool),
      options: {
        temperature: params.temperature,
        stop: params.stop,
      },
    } as unknown as Parameters<Ollama['chat']>[0];

    const response = (await this.client.chat(request)) as {
      model: string;
      message: {
        content?: string;
        tool_calls?: Array<{
          function: { name: string; arguments: string };
        }>;
      };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const message = response.message as {
      content?: string;
      tool_calls?: Array<{
        function: { name: string; arguments: string };
      }>;
    };

    const toolCalls = message.tool_calls?.map(
      (tc): ToolCallRequest => ({
        name: tc.function.name,
        args: parseJson(tc.function.arguments),
        callId: tc.function.name,
      })
    );

    return {
      content: message.content ?? '',
      toolCalls,
      usage: {
        input: response.prompt_eval_count ?? 0,
        output: response.eval_count ?? 0,
        total: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      },
      model: response.model,
      finishReason: 'stop',
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    const request = {
      model: this.config.modelName,
      messages: params.messages.map(toOllamaMessage),
      tools: params.tools?.map(toOllamaTool),
      options: {
        temperature: params.temperature,
        stop: params.stop,
      },
      stream: true,
    } as unknown as Parameters<Ollama['chat']>[0];

    const stream = (await this.client.chat(request)) as unknown as AsyncIterable<{
      message: { content?: string };
      done: boolean;
    }>;

    for await (const chunk of stream) {
      const message = chunk.message as { content?: string };
      if (message.content) {
        yield { type: 'text', delta: message.content };
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

function toOllamaMessage(message: {
  role: string;
  content: string;
}): { role: string; content: string } {
  return { role: message.role, content: message.content };
}

function toOllamaTool(tool: ToolDefinition): {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  };
}

function parseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
