import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from '../AnthropicProvider.js';

vi.mock('@anthropic-ai/sdk');

describe('AnthropicProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates when apiKey is present', async () => {
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: 'claude-3',
      apiKey: 'sk-ant-test',
    });
    expect(await provider.validate()).toBe(true);
  });

  it('returns false when apiKey is missing', async () => {
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: 'claude-3',
      apiKey: '',
    });
    expect(await provider.validate()).toBe(false);
  });

  it('omits the native tools field when public chat receives an empty tool list', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'claude-3',
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'hello' }],
    });
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: { create: mockCreate },
        }) as unknown as Anthropic
    );
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: 'claude-3',
      apiKey: 'sk-ant-test',
    });

    await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('tools');
  });

  it('rejects an assistant-first conversation before calling Anthropic', async () => {
    const mockCreate = vi.fn();
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: { create: mockCreate },
        }) as unknown as Anthropic
    );
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: 'claude-3',
      apiKey: 'sk-ant-test',
    });

    await expect(
      provider.chat({
        messages: [
          { role: 'system', content: 'system' },
          { role: 'assistant', content: 'invalid first turn' },
        ],
      })
    ).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_MESSAGE',
      message: 'Anthropic conversation must start with a user message',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('maps tool_use blocks in response', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'claude-3',
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
      content: [
        { type: 'text', text: 'sure' },
        {
          type: 'tool_use',
          id: 'tu-1',
          name: 'get-weather',
          input: { city: 'Beijing' },
        },
      ],
    });

    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: {
            create: mockCreate,
          },
        }) as unknown as Anthropic
    );

    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: 'claude-3',
      apiKey: 'sk-ant-test',
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

    expect(response.content).toBe('sure');
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe('get-weather');
    expect(response.toolCalls![0].args).toEqual({ city: 'Beijing' });
    expect(response.toolCalls![0].callId).toBe('tu-1');
  });

  it('maps system, assistant tool_use, and user tool_result messages', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'claude-3',
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'done' }],
    });
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: { create: mockCreate },
        }) as unknown as Anthropic
    );
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: 'claude-3',
      apiKey: 'sk-ant-test',
    });

    await provider.chat({
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'weather?' },
        {
          role: 'assistant',
          content: 'Checking.',
          toolCalls: [
            {
              callId: 'tu-1',
              name: 'get-weather',
              args: { city: 'Beijing' },
            },
          ],
        },
        {
          role: 'tool',
          content: '{"temperature":20}',
          toolCallId: 'tu-1',
          toolName: 'get-weather',
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'system',
        messages: [
          { role: 'user', content: 'weather?' },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Checking.' },
              {
                type: 'tool_use',
                id: 'tu-1',
                name: 'get-weather',
                input: { city: 'Beijing' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tu-1',
                content: [{ type: 'text', text: '{"temperature":20}' }],
              },
            ],
          },
        ],
      })
    );
  });

  it('groups multiple tool results from one assistant turn into one user message', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'claude-3',
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'done' }],
    });
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: { create: mockCreate },
        }) as unknown as Anthropic
    );
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: 'claude-3',
      apiKey: 'sk-ant-test',
    });

    await provider.chat({
      messages: [
        { role: 'user', content: 'Compare weather' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              callId: 'tu-1',
              name: 'get-weather',
              args: { city: 'Beijing' },
            },
            {
              callId: 'tu-2',
              name: 'get-weather',
              args: { city: 'Shanghai' },
            },
          ],
        },
        {
          role: 'tool',
          content: '{"temperature":20}',
          toolCallId: 'tu-1',
          toolName: 'get-weather',
        },
        {
          role: 'tool',
          content: '{"temperature":24}',
          toolCallId: 'tu-2',
          toolName: 'get-weather',
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'Compare weather' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tu-1',
                name: 'get-weather',
                input: { city: 'Beijing' },
              },
              {
                type: 'tool_use',
                id: 'tu-2',
                name: 'get-weather',
                input: { city: 'Shanghai' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tu-1',
                content: [{ type: 'text', text: '{"temperature":20}' }],
              },
              {
                type: 'tool_result',
                tool_use_id: 'tu-2',
                content: [{ type: 'text', text: '{"temperature":24}' }],
              },
            ],
          },
        ],
      })
    );
  });

  it('rejects non-object tool arguments from Anthropic', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      model: 'claude-3',
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tu-1',
          name: 'get-weather',
          input: 'Beijing',
        },
      ],
    });
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: { create: mockCreate },
        }) as unknown as Anthropic
    );
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: 'claude-3',
      apiKey: 'sk-ant-test',
    });

    await expect(
      provider.chat({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toMatchObject({
      code: 'INVALID_TOOL_ARGUMENTS',
      message: 'Anthropic returned invalid arguments for tool "get-weather"',
    });
  });
});
