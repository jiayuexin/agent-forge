import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChatResponse,
  IAgent,
  IProvider,
  Logger,
  ToolCallRequest,
  ToolDefinition,
} from '@agentforge/types';
import { AgentExecutor, type AgentExecutorToolEvent } from '../AgentExecutor.js';

const agent = { id: 'agent-1' } as IAgent;
const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
} as unknown as Logger;
const weatherCall: ToolCallRequest = {
  callId: 'call-weather',
  name: 'get-weather',
  args: { city: 'Beijing' },
};

describe('AgentExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds system, history, and user messages and forwards task metadata', async () => {
    const provider = createProvider([response({ content: 'hello' })]);
    const executor = createExecutor(provider);

    const result = await executor.execute({
      type: 'test',
      input: { text: 'hello' },
      context: { history: [{ role: 'assistant', content: 'previous' }] },
      meta: { priority: 1, traceId: 'trace-123' },
    });

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'system' },
          { role: 'assistant', content: 'previous' },
          { role: 'user', content: '{"text":"hello"}' },
        ],
        temperature: 0.5,
        traceId: 'trace-123',
      })
    );
    expect(vi.mocked(provider.chat).mock.calls[0][0]).not.toHaveProperty('tools');
    expect(result).toMatchObject({
      success: true,
      output: { content: 'hello' },
    });
  });

  it('executes one tool and returns the second provider response', async () => {
    const handler = vi.fn().mockResolvedValue({ temperature: 20 });
    const provider = createProvider([
      response({
        content: '',
        toolCalls: [weatherCall],
        usage: { input: 2, output: 1, total: 3 },
        finishReason: 'tool_calls',
      }),
      response({
        content: 'It is 20°C',
        structured: { temperature: 20 },
        usage: { input: 4, output: 2, total: 6 },
        model: 'mock-final',
      }),
    ]);
    const events: string[] = [];
    const executor = createExecutor(provider, [tool('get-weather', handler)], {
      onToolEvent: (event) => {
        events.push(event.type);
      },
    });

    const result = await executor.execute({ type: 'test', input: { city: 'Beijing' } });

    expect(handler).toHaveBeenCalledWith(weatherCall.args, { agent, logger });
    expect(provider.chat).toHaveBeenCalledTimes(2);
    expect(provider.chat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: '{"city":"Beijing"}' },
          { role: 'assistant', content: '', toolCalls: [weatherCall] },
          {
            role: 'tool',
            content: '{"temperature":20}',
            toolCallId: 'call-weather',
            toolName: 'get-weather',
          },
        ],
      })
    );
    expect(events).toEqual(['call', 'result']);
    expect(result).toMatchObject({
      success: true,
      output: {
        content: 'It is 20°C',
        structured: { temperature: 20 },
      },
      meta: {
        tokensUsed: { input: 6, output: 3, total: 9 },
        model: 'mock-final',
        toolsCalled: [
          {
            name: 'get-weather',
            args: { city: 'Beijing' },
            result: { temperature: 20 },
            status: 'success',
          },
        ],
      },
    });
  });

  it('executes all tool calls in one response sequentially', async () => {
    const order: string[] = [];
    const first = vi.fn().mockImplementation(async () => {
      order.push('first');
      return 1;
    });
    const second = vi.fn().mockImplementation(async () => {
      order.push('second');
      return 2;
    });
    const firstCall = { callId: 'call-1', name: 'first-tool', args: {} };
    const secondCall = { callId: 'call-2', name: 'second-tool', args: {} };
    const provider = createProvider([
      response({ toolCalls: [firstCall, secondCall], finishReason: 'tool_calls' }),
      response({ content: 'done' }),
    ]);
    const executor = createExecutor(provider, [
      tool('first-tool', first),
      tool('second-tool', second),
    ]);

    const result = await executor.execute({ type: 'test', input: {} });

    expect(order).toEqual(['first', 'second']);
    expect(result.meta.toolsCalled?.map(({ name }) => name)).toEqual(['first-tool', 'second-tool']);
    expect(vi.mocked(provider.chat).mock.calls[1][0].messages.slice(-2)).toEqual([
      { role: 'tool', content: '1', toolCallId: 'call-1', toolName: 'first-tool' },
      { role: 'tool', content: '2', toolCallId: 'call-2', toolName: 'second-tool' },
    ]);
  });

  it('continues through multiple tool rounds', async () => {
    const firstCall = { callId: 'call-1', name: 'first-tool', args: { value: 1 } };
    const secondCall = { callId: 'call-2', name: 'second-tool', args: { value: 2 } };
    const provider = createProvider([
      response({ toolCalls: [firstCall], finishReason: 'tool_calls' }),
      response({ toolCalls: [secondCall], finishReason: 'tool_calls' }),
      response({ content: 'complete' }),
    ]);
    const executor = createExecutor(provider, [
      tool('first-tool', vi.fn().mockResolvedValue('first-result')),
      tool('second-tool', vi.fn().mockResolvedValue('second-result')),
    ]);

    const result = await executor.execute({ type: 'test', input: {} });

    expect(provider.chat).toHaveBeenCalledTimes(3);
    expect(result.output.content).toBe('complete');
    expect(result.meta.toolsCalled?.map(({ result: toolResult }) => toolResult)).toEqual([
      'first-result',
      'second-result',
    ]);
    expect(vi.mocked(provider.chat).mock.calls[2][0].messages).toContainEqual({
      role: 'assistant',
      content: '',
      toolCalls: [secondCall],
    });
  });

  it('returns a clear tool error for an unknown tool without asking the provider again', async () => {
    const provider = createProvider([
      response({ toolCalls: [weatherCall], finishReason: 'tool_calls' }),
    ]);
    const executor = createExecutor(provider);

    const result = await executor.execute({ type: 'test', input: {} });

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'TOOL_NOT_FOUND',
        message: 'Tool "get-weather" is not registered',
      },
      meta: {
        toolsCalled: [
          {
            name: 'get-weather',
            status: 'error',
            error: 'Tool "get-weather" is not registered',
          },
        ],
      },
    });
  });

  it('returns a real error record when a tool throws and does not retry', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('tool exploded'));
    const provider = createProvider([
      response({ toolCalls: [weatherCall], finishReason: 'tool_calls' }),
    ]);
    const executor = createExecutor(provider, [tool('get-weather', handler)]);

    const result = await executor.execute({ type: 'test', input: {} });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: 'Tool "get-weather" execution failed',
      },
      meta: {
        toolsCalled: [
          {
            status: 'error',
            error: 'Tool "get-weather" execution failed',
            duration: expect.any(Number),
          },
        ],
      },
    });
  });

  it('returns an error record when a tool result is undefined', async () => {
    await expectUnserializableToolResult(undefined);
  });

  it('returns an error record when a tool result contains BigInt', async () => {
    await expectUnserializableToolResult({ value: 1n });
  });

  it('returns an error record when a tool result is circular', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expectUnserializableToolResult(circular);
  });

  it('returns an error record when a tool result is NaN', async () => {
    await expectUnserializableToolResult(Number.NaN);
  });

  it('returns an error record when a tool result is Infinity', async () => {
    await expectUnserializableToolResult(Number.POSITIVE_INFINITY);
  });

  it('returns an error record when a tool result is a function', async () => {
    await expectUnserializableToolResult(() => 'not JSON');
  });

  it('returns an error record when a tool result is a symbol', async () => {
    await expectUnserializableToolResult(Symbol('not JSON'));
  });

  it('returns an error record when an array contains undefined', async () => {
    await expectUnserializableToolResult([undefined]);
  });

  it('returns an error record when an object contains undefined', async () => {
    await expectUnserializableToolResult({ value: undefined });
  });

  it('redacts sensitive tool args from public records, details, and events', async () => {
    const failure = new Error('database leaked an internal bearer token');
    const sensitiveCall: ToolCallRequest = {
      callId: 'call-sensitive',
      name: 'sensitive-tool',
      args: {
        token: 'token-value',
        nested: {
          apiKey: 'api-key-value',
          PASSWORD: 'password-value',
          safe: 'visible',
        },
      },
    };
    const provider = createProvider([
      response({ toolCalls: [sensitiveCall], finishReason: 'tool_calls' }),
    ]);
    const events: AgentExecutorToolEvent[] = [];
    const executor = createExecutor(
      provider,
      [tool('sensitive-tool', vi.fn().mockRejectedValue(failure))],
      {
        onToolEvent: (event) => {
          events.push(event);
        },
      }
    );

    const result = await executor.execute({ type: 'test', input: {} });
    const publicPayload = JSON.stringify({ result, events });

    expect(result.error?.message).toBe('Tool "sensitive-tool" execution failed');
    expect(result.meta.toolsCalled?.[0]?.args).toEqual({
      token: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        PASSWORD: '[REDACTED]',
        safe: 'visible',
      },
    });
    expect(events[0]).toMatchObject({
      type: 'call',
      call: {
        args: {
          token: '[REDACTED]',
          nested: {
            apiKey: '[REDACTED]',
            PASSWORD: '[REDACTED]',
            safe: 'visible',
          },
        },
      },
    });
    expect(publicPayload).not.toContain('token-value');
    expect(publicPayload).not.toContain('api-key-value');
    expect(publicPayload).not.toContain('password-value');
    expect(publicPayload).not.toContain(failure.message);
  });

  it('fails before exceeding maxToolCalls and preserves completed records and usage', async () => {
    const handler = vi.fn().mockResolvedValue('done');
    const provider = createProvider([
      response({
        toolCalls: [weatherCall],
        usage: { input: 1, output: 2, total: 3 },
        finishReason: 'tool_calls',
      }),
      response({
        toolCalls: [{ ...weatherCall, callId: 'call-again' }],
        usage: { input: 4, output: 5, total: 9 },
        finishReason: 'tool_calls',
      }),
    ]);
    const executor = createExecutor(provider, [tool('get-weather', handler)], {
      maxToolCalls: 1,
    });

    const result = await executor.execute({ type: 'test', input: {} });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'MAX_TOOL_CALLS_EXCEEDED',
        message: 'Tool call limit of 1 would be exceeded',
      },
      meta: {
        tokensUsed: { input: 5, output: 7, total: 12 },
        toolsCalled: [expect.objectContaining({ status: 'success' })],
      },
    });
  });

  it('uses a default limit of 20 tool calls', async () => {
    const handler = vi.fn().mockResolvedValue('unused');
    const provider = createProvider([
      response({
        toolCalls: Array.from({ length: 21 }, (_, index) => ({
          ...weatherCall,
          callId: `call-${index}`,
        })),
        finishReason: 'tool_calls',
      }),
    ]);
    const executor = createExecutor(provider, [tool('get-weather', handler)]);

    const result = await executor.execute({ type: 'test', input: {} });

    expect(handler).not.toHaveBeenCalled();
    expect(result.error?.code).toBe('MAX_TOOL_CALLS_EXCEEDED');
  });

  it.each([
    ['NaN', Number.NaN],
    ['a negative number', -1],
    ['a decimal', 1.5],
    ['positive infinity', Number.POSITIVE_INFINITY],
  ])('rejects maxToolCalls when it is %s', (_label, maxToolCalls) => {
    const provider = createProvider([response()]);

    expect(() => createExecutor(provider, [], { maxToolCalls })).toThrow(
      expect.objectContaining({
        code: 'INVALID_MAX_TOOL_CALLS',
        message: 'maxToolCalls must be a non-negative finite integer',
      })
    );
  });
});

function createExecutor(
  provider: IProvider,
  tools: ToolDefinition[] = [],
  overrides: Partial<ConstructorParameters<typeof AgentExecutor>[0]> = {}
): AgentExecutor {
  return new AgentExecutor({
    provider,
    tools,
    systemPrompt: 'system',
    agent,
    logger,
    ...overrides,
  });
}

function createProvider(responses: ChatResponse[]): IProvider {
  const chat = vi.fn();
  for (const item of responses) {
    chat.mockResolvedValueOnce(item);
  }
  return {
    provider: 'mock',
    chat,
    chatStream: async function* () {},
    validate: async () => true,
  };
}

function response(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    content: '',
    usage: { input: 1, output: 1, total: 2 },
    model: 'mock',
    finishReason: 'stop',
    ...overrides,
  };
}

function tool(name: string, handler: ToolDefinition['handler']): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: 'object' },
    handler,
  };
}

async function expectUnserializableToolResult(toolResult: unknown): Promise<void> {
  const handler = vi.fn().mockResolvedValue(toolResult);
  const provider = createProvider([
    response({ toolCalls: [weatherCall], finishReason: 'tool_calls' }),
    response({ content: 'must not be requested' }),
  ]);
  const events: AgentExecutorToolEvent[] = [];
  const executor = createExecutor(provider, [tool('get-weather', handler)], {
    onToolEvent: (event) => {
      events.push(event);
    },
  });

  const result = await executor.execute({ type: 'test', input: {} });

  expect(provider.chat).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({
    success: false,
    error: {
      code: 'TOOL_RESULT_SERIALIZATION_FAILED',
      message: 'Result from tool "get-weather" could not be serialized',
    },
    meta: {
      toolsCalled: [
        expect.objectContaining({
          name: 'get-weather',
          status: 'error',
          errorCode: 'TOOL_RESULT_SERIALIZATION_FAILED',
          error: 'Result from tool "get-weather" could not be serialized',
        }),
      ],
    },
  });
  expect(events).toEqual([
    { type: 'call', call: weatherCall },
    {
      type: 'result',
      call: weatherCall,
      record: expect.objectContaining({
        status: 'error',
        errorCode: 'TOOL_RESULT_SERIALIZATION_FAILED',
      }),
    },
  ]);
}
