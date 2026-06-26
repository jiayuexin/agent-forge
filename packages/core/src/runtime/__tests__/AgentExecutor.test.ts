import { describe, it, expect, vi } from 'vitest';
import type { IProvider } from '@agentforge/types';
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
  it('returns a result from the provider', async () => {
    const executor = new AgentExecutor(mockProvider, [], 'system');
    const result = await executor.execute({ type: 'test', input: { value: 1 } });

    expect(result.success).toBe(true);
    expect(result.output.content).toBe('hello');
  });
});
