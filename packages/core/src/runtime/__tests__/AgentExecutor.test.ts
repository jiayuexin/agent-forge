import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IProvider, ToolCallRequest } from '@agentforge/types';
import { AgentExecutor } from '../AgentExecutor.js';

const mockProvider: IProvider = {
  provider: 'mock',
  chat: vi.fn().mockResolvedValue({
    content: 'hello',
    usage: { input: 1, output: 1, total: 2 },
    model: 'mock',
    finishReason: 'stop',
  }),
  chatStream: async function* () {},
  validate: async () => true,
};

describe('AgentExecutor', () => {
  beforeEach(() => {
    vi.mocked(mockProvider.chat).mockClear();
  });

  it('returns a result from the provider', async () => {
    const executor = new AgentExecutor(mockProvider, [], 'system');
    const result = await executor.execute({ type: 'test', input: { value: 1 } });

    expect(result.success).toBe(true);
    expect(result.output.content).toBe('hello');
  });

  it('passes stringified object input as user message', async () => {
    const executor = new AgentExecutor(mockProvider, [], 'system');
    await executor.execute({ type: 'test', input: { text: 'plain text' } });

    expect(mockProvider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: '{"text":"plain text"}' },
        ],
      })
    );
  });

  it('prepends history from task context', async () => {
    const executor = new AgentExecutor(mockProvider, [], 'system');
    await executor.execute({
      type: 'test',
      input: { text: 'hello' },
      context: { history: [{ role: 'assistant', content: 'previous' }] },
    });

    expect(mockProvider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'system' },
          { role: 'assistant', content: 'previous' },
          { role: 'user', content: '{"text":"hello"}' },
        ],
      })
    );
  });

  it('sets temperature and traceId from meta', async () => {
    const executor = new AgentExecutor(mockProvider, [], 'system');
    await executor.execute({
      type: 'test',
      input: { text: 'hello' },
      meta: { priority: 1, traceId: 'trace-123' },
    });

    expect(mockProvider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.5,
        traceId: 'trace-123',
      })
    );
  });

  it('maps toolCalls to toolsCalled meta', async () => {
    const toolCall: ToolCallRequest = { callId: 'tc-1', name: 'search', args: { q: 'x' } };
    vi.mocked(mockProvider.chat).mockResolvedValueOnce({
      content: '',
      usage: { input: 1, output: 1, total: 2 },
      model: 'mock',
      finishReason: 'tool_calls',
      toolCalls: [toolCall],
    });

    const executor = new AgentExecutor(mockProvider, [], 'system');
    const result = await executor.execute({ type: 'test', input: { text: 'hello' } });

    expect(result.meta?.toolsCalled).toEqual([
      { name: 'search', args: { q: 'x' }, result: null, duration: 0, status: 'success' },
    ]);
  });

  it('preserves structured output', async () => {
    vi.mocked(mockProvider.chat).mockResolvedValueOnce({
      content: '',
      usage: { input: 1, output: 1, total: 2 },
      model: 'mock',
      finishReason: 'stop',
      structured: { answer: 42 },
    });

    const executor = new AgentExecutor(mockProvider, [], 'system');
    const result = await executor.execute({ type: 'test', input: { text: 'hello' } });

    expect(result.output.structured).toEqual({ answer: 42 });
  });
});
