import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Ollama } from 'ollama';
import { OllamaProvider } from '../OllamaProvider.js';

vi.mock('ollama');

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps ordinary chat working when tool definitions are present but unused', async () => {
    const mockChat = vi.fn().mockResolvedValue({
      model: 'llama3',
      message: {
        content: 'hello',
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
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'hi' },
      ],
      tools: [
        {
          name: 'get-weather',
          description: 'Get weather',
          parameters: { type: 'object' },
        },
      ],
    });

    expect(response.content).toBe('hello');
    expect(response.toolCalls).toBeUndefined();
    expect(mockChat).toHaveBeenCalledWith({
      model: 'llama3',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'hi' },
      ],
      options: {
        temperature: undefined,
        stop: undefined,
      },
    });
  });

  it('fails explicitly when tool fields cannot be represented by Ollama 0.5 types', async () => {
    const mockChat = vi.fn();
    vi.mocked(Ollama).mockImplementation(
      () =>
        ({
          chat: mockChat,
          list: vi.fn(),
        }) as unknown as Ollama
    );
    const provider = new OllamaProvider({
      provider: 'ollama',
      modelName: 'llama3',
    });

    await expect(
      provider.chat({
        messages: [
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
        tools: [
          {
            name: 'get-weather',
            description: 'Get weather',
            parameters: { type: 'object' },
          },
        ],
      })
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_OLLAMA_TOOLS',
      message: 'Installed Ollama SDK 0.5 does not support tool definitions or tool messages',
    });
    expect(mockChat).not.toHaveBeenCalled();
  });
});
