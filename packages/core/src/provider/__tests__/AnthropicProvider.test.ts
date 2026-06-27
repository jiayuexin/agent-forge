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
});
