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
});
