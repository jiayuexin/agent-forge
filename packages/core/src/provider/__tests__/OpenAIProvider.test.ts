import { describe, it, expect, vi, beforeEach } from 'vitest';
import OpenAI from 'openai';
import { OpenAIProvider } from '../OpenAIProvider.js';

vi.mock('openai');

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates when apiKey is present', async () => {
    const provider = new OpenAIProvider({
      provider: 'openai',
      modelName: 'gpt-4',
      apiKey: 'sk-test',
    });
    expect(await provider.validate()).toBe(true);
  });

  it('returns false when apiKey is missing', async () => {
    const provider = new OpenAIProvider({
      provider: 'openai',
      modelName: 'gpt-4',
      apiKey: '',
    });
    expect(await provider.validate()).toBe(false);
  });

  it('omits the native tools field when public chat receives an empty tool list', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'gpt-4',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [{ finish_reason: 'stop', message: { content: 'hello' } }],
    });
    vi.mocked(OpenAI).mockImplementation(
      () =>
        ({
          chat: { completions: { create: mockCreate } },
        }) as unknown as OpenAI
    );
    const provider = new OpenAIProvider({
      provider: 'openai',
      modelName: 'gpt-4',
      apiKey: 'sk-test',
    });

    await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('tools');
  });

  it('maps tool calls in response', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'gpt-4',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: 'hello',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'get-weather', arguments: '{"city":"Beijing"}' },
              },
            ],
          },
        },
      ],
    });

    vi.mocked(OpenAI).mockImplementation(
      () =>
        ({
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        }) as unknown as OpenAI
    );

    const provider = new OpenAIProvider({
      provider: 'openai',
      modelName: 'gpt-4',
      apiKey: 'sk-test',
    });
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        {
          name: 'get-weather',
          description: 'Get weather',
          parameters: { type: 'object' },
        },
      ],
    });

    expect(response.content).toBe('hello');
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe('get-weather');
    expect(response.toolCalls![0].args).toEqual({ city: 'Beijing' });
    expect(response.toolCalls![0].callId).toBe('call-1');
  });

  it('maps assistant tool calls and tool results to OpenAI message fields', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'gpt-4',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [{ finish_reason: 'stop', message: { content: 'done' } }],
    });
    vi.mocked(OpenAI).mockImplementation(
      () =>
        ({
          chat: { completions: { create: mockCreate } },
        }) as unknown as OpenAI
    );
    const provider = new OpenAIProvider({
      provider: 'openai',
      modelName: 'gpt-4',
      apiKey: 'sk-test',
    });

    await provider.chat({
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'weather?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              callId: 'call-1',
              name: 'get-weather',
              args: { city: 'Beijing' },
            },
          ],
        },
        {
          role: 'tool',
          content: '{"temperature":20}',
          toolCallId: 'call-1',
          toolName: 'get-weather',
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'get-weather',
                  arguments: '{"city":"Beijing"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            content: '{"temperature":20}',
            tool_call_id: 'call-1',
          },
        ],
      })
    );
  });

  it('rejects invalid JSON tool arguments instead of silently replacing them', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'gpt-4',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: '',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'get-weather', arguments: '{invalid' },
              },
            ],
          },
        },
      ],
    });
    vi.mocked(OpenAI).mockImplementation(
      () =>
        ({
          chat: { completions: { create: mockCreate } },
        }) as unknown as OpenAI
    );
    const provider = new OpenAIProvider({
      provider: 'openai',
      modelName: 'gpt-4',
      apiKey: 'sk-test',
    });

    await expect(
      provider.chat({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toMatchObject({
      code: 'INVALID_TOOL_ARGUMENTS',
      message: 'OpenAI returned invalid arguments for tool "get-weather"',
    });
  });
});
