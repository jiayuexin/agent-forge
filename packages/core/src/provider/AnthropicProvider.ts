import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatParams,
  ChatResponse,
  ChatChunk,
  AnthropicModelConfig,
  Message,
  ToolDefinition,
  ToolCallRequest,
} from '@agentforge/types';
import { BaseProvider } from './BaseProvider';

export class AnthropicProvider extends BaseProvider<AnthropicModelConfig> {
  readonly provider = 'anthropic';
  private client: Anthropic;

  constructor(config: AnthropicModelConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const { system, messages } = this.splitSystemMessage(params.messages);

    const response = await this.client.messages.create(
      {
        model: this.config.modelName,
        max_tokens: params.maxTokens ?? this.config.maxTokens ?? 4096,
        system: system ?? undefined,
        messages,
        tools: this.convertTools(params.tools),
        temperature: params.temperature ?? this.config.temperature,
        stop_sequences: params.stop,
      },
      { signal: params.timeout ? AbortSignal.timeout(params.timeout) : undefined },
    );

    // Extract text content and tool calls from content blocks
    const textParts: string[] = [];
    const toolCalls: ToolCallRequest[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name,
          args: block.input as Record<string, unknown>,
          callId: block.id,
        });
      }
    }

    return {
      content: textParts.join(''),
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      finishReason: this.mapStopReason(response.stop_reason),
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    const { system, messages } = this.splitSystemMessage(params.messages);

    const stream = this.client.messages.stream({
      model: this.config.modelName,
      max_tokens: params.maxTokens ?? this.config.maxTokens ?? 4096,
      system: system ?? undefined,
      messages,
      tools: this.convertTools(params.tools),
      temperature: params.temperature ?? this.config.temperature,
      stop_sequences: params.stop,
    });

    // Accumulate partial tool call JSON across deltas
    const toolCallAccumulators = new Map<
      number,
      { id: string; name: string; jsonChunks: string[] }
    >();
    let inputTokens = 0;

    for await (const event of stream) {
      switch (event.type) {
        case 'message_start': {
          inputTokens = event.message.usage.input_tokens;
          break;
        }

        case 'content_block_start': {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            toolCallAccumulators.set(event.index, {
              id: block.id,
              name: block.name,
              jsonChunks: [],
            });
            yield {
              type: 'tool_call',
              toolCallDelta: { index: event.index, name: block.name },
            };
          }
          break;
        }

        case 'content_block_delta': {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            yield { type: 'text', delta: delta.text };
          } else if (delta.type === 'input_json_delta') {
            const acc = toolCallAccumulators.get(event.index);
            if (acc) {
              acc.jsonChunks.push(delta.partial_json);
              yield {
                type: 'tool_call',
                toolCallDelta: { index: event.index, argsDelta: delta.partial_json },
              };
            }
          }
          break;
        }

        case 'content_block_stop': {
          // Emit the completed tool call
          const acc = toolCallAccumulators.get(event.index);
          if (acc) {
            const fullJson = acc.jsonChunks.join('');
            yield {
              type: 'tool_call',
              toolCall: {
                name: acc.name,
                args: JSON.parse(fullJson),
                callId: acc.id,
              },
              toolCallDelta: { index: event.index },
            };
          }
          break;
        }

        case 'message_delta': {
          yield {
            type: 'done',
            usage: {
              input: inputTokens,
              output: event.usage.output_tokens,
              total: inputTokens + event.usage.output_tokens,
            },
            finishReason: this.mapStopReason(event.delta.stop_reason),
          };
          break;
        }
      }
    }
  }

  async validate(): Promise<boolean> {
    try {
      // Anthropic SDK v0.27 does not expose a models endpoint.
      // Make a minimal message request to verify the API key works.
      await this.client.messages.create({
        model: this.config.modelName,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  // --- Conversion helpers ---

  /**
   * Anthropic requires `system` as a separate top-level param, not as a message role.
   * This splits system messages out from the message list.
   */
  protected splitSystemMessage(messages: Message[]): {
    system: string | undefined;
    messages: Anthropic.MessageParam[];
  } {
    const systemParts: string[] = [];
    const converted: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
        continue;
      }

      if (msg.role === 'tool') {
        // Anthropic: tool results go in user messages as tool_result content blocks
        converted.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId ?? '',
              content: msg.content,
            },
          ],
        });
        continue;
      }

      if (msg.role === 'assistant') {
        // If there's tool call info embedded, we can emit tool_use blocks.
        // For now, assistant messages with plain content map directly.
        converted.push({
          role: 'assistant',
          content: msg.content,
        });
        continue;
      }

      // user
      converted.push({
        role: 'user',
        content: msg.content,
      });
    }

    return {
      system: systemParts.length ? systemParts.join('\n\n') : undefined,
      messages: converted,
    };
  }

  protected convertTools(
    tools?: ToolDefinition[],
  ): Anthropic.Tool[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        ...(tool.parameters as Record<string, unknown>),
      },
    }));
  }

  protected mapStopReason(reason: string | null): string {
    const mapping: Record<string, string> = {
      end_turn: 'stop',
      tool_use: 'tool_call',
      max_tokens: 'max_tokens',
      stop_sequence: 'stop',
    };
    return mapping[reason ?? ''] ?? reason ?? 'stop';
  }
}
