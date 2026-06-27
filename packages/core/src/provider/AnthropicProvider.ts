import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatParams,
  ChatResponse,
  ChatChunk,
  IProvider,
  ModelConfig,
  AnthropicModelConfig,
  ToolCallRequest,
  ToolDefinition,
} from '@agentforge/types';

export class AnthropicProvider implements IProvider {
  readonly provider = 'anthropic';
  private client: Anthropic;
  private config: AnthropicModelConfig;

  constructor(config: ModelConfig) {
    if (config.provider !== 'anthropic') {
      throw new Error('AnthropicProvider requires provider: anthropic');
    }
    this.config = config as AnthropicModelConfig;
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: this.config.modelName,
      max_tokens: params.maxTokens ?? 1024,
      messages: params.messages as Anthropic.Messages.MessageParam[],
      tools: params.tools?.map(toAnthropicTool),
      temperature: params.temperature,
      stop_sequences: params.stop,
    });

    const contentBlocks = response.content;
    let content = '';
    const toolCalls: ToolCallRequest[] = [];

    for (const block of contentBlocks) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name,
          args: block.input as Record<string, unknown>,
          callId: block.id,
        });
      }
    }

    return {
      content,
      toolCalls,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      finishReason: response.stop_reason ?? 'stop',
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    const stream = await this.client.messages.create({
      model: this.config.modelName,
      max_tokens: params.maxTokens ?? 1024,
      messages: params.messages as Anthropic.Messages.MessageParam[],
      tools: params.tools?.map(toAnthropicTool),
      temperature: params.temperature,
      stop_sequences: params.stop,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          yield { type: 'text', delta: delta.text };
        }
      } else if (event.type === 'content_block_stop') {
        yield { type: 'done' };
      }
    }
  }

  async validate(): Promise<boolean> {
    return Boolean(this.config.apiKey);
  }
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Messages.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Messages.Tool.InputSchema,
  };
}
