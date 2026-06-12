import OpenAI from 'openai';
import type {
  ChatParams,
  ChatResponse,
  ChatChunk,
  OllamaModelConfig,
  Message,
  ToolDefinition,
  ToolCallRequest,
} from '@agentforge/types';
import { BaseProvider } from './BaseProvider';

const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';

export class OllamaProvider extends BaseProvider<OllamaModelConfig> {
  readonly provider = 'ollama';
  private client: OpenAI;

  constructor(config: OllamaModelConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: 'ollama', // Ollama doesn't require an API key but the SDK needs a non-empty value
      baseURL: config.baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create(
      {
        model: this.config.modelName,
        messages: this.convertMessages(params.messages),
        tools: this.convertTools(params.tools),
        temperature: params.temperature ?? this.config.temperature,
        max_tokens: params.maxTokens ?? this.config.maxTokens,
        stop: params.stop,
        stream: false,
      },
      { signal: params.timeout ? AbortSignal.timeout(params.timeout) : undefined },
    );

    const choice = response.choices[0];
    const message = choice.message;

    const toolCalls: ToolCallRequest[] | undefined = message.tool_calls?.map((tc) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments),
      callId: tc.id,
    }));

    return {
      content: message.content ?? '',
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.config.modelName,
      messages: this.convertMessages(params.messages),
      tools: this.convertTools(params.tools),
      temperature: params.temperature ?? this.config.temperature,
      max_tokens: params.maxTokens ?? this.config.maxTokens,
      stop: params.stop,
      stream: true,
      stream_options: { include_usage: true },
    });

    // Accumulate partial tool calls across chunks
    const toolCallAccumulators = new Map<
      number,
      { id: string; name: string; argsChunks: string[] }
    >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];

      // Usage chunk (final chunk with stream_options.include_usage)
      if (!choice && chunk.usage) {
        yield {
          type: 'done',
          usage: {
            input: chunk.usage.prompt_tokens,
            output: chunk.usage.completion_tokens,
            total: chunk.usage.total_tokens,
          },
          finishReason: undefined,
        };
        continue;
      }

      if (!choice) continue;

      const delta = choice.delta;

      // Text content delta
      if (delta.content) {
        yield { type: 'text', delta: delta.content };
      }

      // Tool call deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;

          if (tc.id && tc.function?.name) {
            toolCallAccumulators.set(idx, {
              id: tc.id,
              name: tc.function.name,
              argsChunks: [],
            });
            yield {
              type: 'tool_call',
              toolCallDelta: { index: idx, name: tc.function.name },
            };
          }

          if (tc.function?.arguments) {
            const acc = toolCallAccumulators.get(idx);
            if (acc) {
              acc.argsChunks.push(tc.function.arguments);
              yield {
                type: 'tool_call',
                toolCallDelta: { index: idx, argsDelta: tc.function.arguments },
              };
            }
          }
        }
      }

      // Finish reason
      if (choice.finish_reason) {
        // Emit completed tool calls
        for (const [index, acc] of toolCallAccumulators) {
          const fullArgs = acc.argsChunks.join('');
          yield {
            type: 'tool_call',
            toolCall: {
              name: acc.name,
              args: JSON.parse(fullArgs),
              callId: acc.id,
            },
            toolCallDelta: { index },
          };
        }

        yield {
          type: 'done',
          finishReason: this.mapFinishReason(choice.finish_reason),
        };
      }
    }
  }

  async validate(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  // --- Conversion helpers ---

  protected convertMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return { role: 'system' as const, content: msg.content };
        case 'user':
          return { role: 'user' as const, content: msg.content };
        case 'assistant':
          return { role: 'assistant' as const, content: msg.content };
        case 'tool':
          return {
            role: 'tool' as const,
            content: msg.content,
            tool_call_id: msg.toolCallId ?? '',
          };
      }
    });
  }

  protected convertTools(
    tools?: ToolDefinition[],
  ): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      },
    }));
  }

  protected mapFinishReason(reason: string | null): string {
    const mapping: Record<string, string> = {
      stop: 'stop',
      tool_calls: 'tool_call',
      length: 'max_tokens',
      content_filter: 'stop',
    };
    return mapping[reason ?? ''] ?? reason ?? 'stop';
  }
}
