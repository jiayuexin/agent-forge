import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatParams,
  ChatResponse,
  ChatChunk,
  IProvider,
  Message,
  ModelConfig,
  AnthropicModelConfig,
  ToolCallRequest,
  ToolDefinition,
} from '@agentforge/types';
import { CoreError } from '../errors.js';

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
    const { messages, system } = toAnthropicMessages(params.messages);
    const tools = params.tools?.map(toAnthropicTool);
    const response = await this.client.messages.create({
      model: this.config.modelName,
      max_tokens: params.maxTokens ?? 1024,
      messages,
      system,
      ...(tools?.length ? { tools } : {}),
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
          args: toToolArgs(block.input, block.name),
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
    const { messages, system } = toAnthropicMessages(params.messages);
    const tools = params.tools?.map(toAnthropicTool);
    const stream = await this.client.messages.create({
      model: this.config.modelName,
      max_tokens: params.maxTokens ?? 1024,
      messages,
      system,
      ...(tools?.length ? { tools } : {}),
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

function toAnthropicMessages(messages: Message[]): {
  messages: Anthropic.Messages.MessageParam[];
  system?: string;
} {
  const firstConversationMessage = messages.find((message) => message.role !== 'system');
  if (firstConversationMessage && firstConversationMessage.role !== 'user') {
    throw new CoreError(
      'INVALID_PROVIDER_MESSAGE',
      'Anthropic conversation must start with a user message'
    );
  }

  const systemMessages: string[] = [];
  const conversation: Anthropic.Messages.MessageParam[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === 'system') {
      systemMessages.push(message.content);
      continue;
    }
    if (message.role === 'tool') {
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      let toolIndex = index;
      while (messages[toolIndex]?.role === 'tool') {
        toolResults.push(toAnthropicToolResult(messages[toolIndex]));
        toolIndex += 1;
      }
      conversation.push({ role: 'user', content: toolResults });
      index = toolIndex - 1;
      continue;
    }
    conversation.push(toAnthropicMessage(message));
  }

  return {
    messages: conversation,
    ...(systemMessages.length > 0 ? { system: systemMessages.join('\n\n') } : {}),
  };
}

function toAnthropicMessage(message: Message): Anthropic.Messages.MessageParam {
  if (message.role === 'user') {
    return { role: 'user', content: message.content };
  }

  if (message.role === 'tool') {
    return {
      role: 'user',
      content: [toAnthropicToolResult(message)],
    };
  }

  if (message.role === 'assistant') {
    if (!message.toolCalls?.length) {
      return { role: 'assistant', content: message.content };
    }
    const content: Array<Anthropic.Messages.TextBlockParam | Anthropic.Messages.ToolUseBlockParam> =
      [];
    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }
    content.push(
      ...message.toolCalls.map((call) => ({
        type: 'tool_use' as const,
        id: call.callId,
        name: call.name,
        input: call.args,
      }))
    );
    return { role: 'assistant', content };
  }

  throw new CoreError(
    'INVALID_PROVIDER_MESSAGE',
    'Anthropic system messages must be passed through the system field'
  );
}

function toAnthropicToolResult(message: Message): Anthropic.Messages.ToolResultBlockParam {
  if (!message.toolCallId) {
    throw new CoreError('INVALID_TOOL_MESSAGE', 'Anthropic tool messages require toolCallId');
  }
  return {
    type: 'tool_result',
    tool_use_id: message.toolCallId,
    content: [{ type: 'text', text: message.content }],
  };
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Messages.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Messages.Tool.InputSchema,
  };
}

function toToolArgs(input: unknown, toolName: string): Record<string, unknown> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  throw new CoreError(
    'INVALID_TOOL_ARGUMENTS',
    `Anthropic returned invalid arguments for tool "${toolName}"`,
    { input }
  );
}
