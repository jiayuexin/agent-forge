import OpenAI from 'openai';
import type {
  ChatParams,
  ChatResponse,
  ChatChunk,
  IProvider,
  ModelConfig,
  OpenAIModelConfig,
  ToolCallRequest,
  ToolDefinition,
} from '@agentforge/types';

export class OpenAIProvider implements IProvider {
  readonly provider = 'openai';
  private client: OpenAI;
  private config: OpenAIModelConfig;

  constructor(config: ModelConfig) {
    if (config.provider !== 'openai') {
      throw new Error('OpenAIProvider requires provider: openai');
    }
    this.config = config as OpenAIModelConfig;
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      organization: this.config.organization,
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: this.config.modelName,
      messages: params.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      tools: params.tools?.map(toOpenAITool),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      stop: params.stop,
    });

    const choice = response.choices[0];
    const message = choice.message;

    return {
      content: message.content ?? '',
      toolCalls: message.tool_calls?.map(toToolCallRequest),
      usage: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
      finishReason: choice.finish_reason ?? 'stop',
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.config.modelName,
      messages: params.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      tools: params.tools?.map(toOpenAITool),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      stop: params.stop,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: 'text', delta: delta.content };
      }

      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          yield {
            type: 'tool_call',
            toolCallDelta: {
              index: toolCallDelta.index ?? 0,
              name: toolCallDelta.function?.name,
              argsDelta: toolCallDelta.function?.arguments,
            },
          };
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        yield { type: 'done', finishReason: chunk.choices[0].finish_reason };
      }
    }
  }

  async validate(): Promise<boolean> {
    return Boolean(this.config.apiKey);
  }
}

function toOpenAITool(tool: ToolDefinition): OpenAI.Chat.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  };
}

function toToolCallRequest(
  toolCall: OpenAI.Chat.ChatCompletionMessageToolCall
): ToolCallRequest {
  return {
    name: toolCall.function.name,
    args: parseJson(toolCall.function.arguments),
    callId: toolCall.id,
  };
}

function parseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
