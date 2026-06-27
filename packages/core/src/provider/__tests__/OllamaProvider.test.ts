import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Ollama } from 'ollama';
import { OllamaProvider } from '../OllamaProvider.js';

vi.mock('ollama');

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps tool calls in response', async () => {
    const mockChat = vi.fn().mockResolvedValue({
      model: 'llama3',
      message: {
        content: 'hello',
        tool_calls: [
          {
            function: {
              name: 'get-weather',
              arguments: '{"city":"Beijing"}',
            },
          },
        ],
      },
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const mockList = vi.fn().mockResolvedValue({ models: [] });

    vi.mocked(Ollama).mockImplementation(
      () =>
        ({
          chat: mockChat,
          list: mockList,
        }) as unknown as Ollama
    );

    const provider = new OllamaProvider({
      provider: 'ollama',
      modelName: 'llama3',
      baseUrl: 'http://localhost:11434',
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
  });
});
