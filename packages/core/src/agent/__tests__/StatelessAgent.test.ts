import { describe, it, expect, beforeAll } from 'vitest';
import { StatelessAgent } from '../StatelessAgent.js';
import type { StatelessAgentConfig } from '@agentforge/types';
import { ProviderFactory } from '../../provider/ProviderFactory.js';
import { MockProvider } from '../../provider/MockProvider.js';

beforeAll(() => {
  ProviderFactory.register('mock', MockProvider);
});

const statelessConfig: StatelessAgentConfig = {
  identity: { name: 'stateless', role: 'worker', version: '0.0.1' },
  model: { provider: 'mock', modelName: 'mock-model' },
  systemPrompt: 'do work',
};

describe('StatelessAgent', () => {
  it('is stateless', () => {
    const agent = new StatelessAgent(statelessConfig);
    expect(agent.isStateless).toBe(true);
  });

  it('executes a task', async () => {
    const agent = new StatelessAgent(statelessConfig);
    await agent.init();

    const result = await agent.execute({ type: 'test', input: { value: 1 } });
    expect(result.success).toBe(true);
  });
});
