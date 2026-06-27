import { describe, it, expect, beforeAll } from 'vitest';
import { AgentStatus, type AgentConfig, type AgentResult, type AgentTask } from '@agentforge/types';
import { BaseAgent } from '../BaseAgent.js';
import { ProviderFactory } from '../../provider/ProviderFactory.js';
import { MockProvider } from '../../provider/MockProvider.js';

class TestAgent extends BaseAgent {
  doExecuteCalls: AgentTask[] = [];

  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    this.doExecuteCalls.push(task);
    return {
      success: true,
      output: { content: 'done' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'test',
      },
    };
  }
}

const baseConfig: AgentConfig = {
  identity: { name: 'test', role: 'test', version: '0.0.1' },
  model: { provider: 'mock', modelName: 'mock-model' },
  systemPrompt: 'test',
};

describe('BaseAgent', () => {
  beforeAll(() => {
    ProviderFactory.register('mock', MockProvider);
  });

  it('initializes and transitions to ready', async () => {
    const agent = new TestAgent(baseConfig);
    await agent.init();
    expect(agent.status).toBe(AgentStatus.READY);
  });

  it('emits lifecycle events', async () => {
    const agent = new TestAgent(baseConfig);
    const events: string[] = [];

    agent.on('agent:init', () => {
      events.push('init');
    });
    agent.on('agent:ready', () => {
      events.push('ready');
    });

    await agent.init();
    expect(events).toEqual(['init', 'ready']);
  });

  it('executes a task through doExecute', async () => {
    const agent = new TestAgent(baseConfig);
    await agent.init();

    const task: AgentTask = { type: 'test', input: { value: 1 } };
    const result = await agent.execute(task);

    expect(result.success).toBe(true);
    expect(agent.doExecuteCalls).toHaveLength(1);
  });

  it('destroys and cannot execute afterwards', async () => {
    const agent = new TestAgent(baseConfig);
    await agent.init();
    await agent.destroy();
    expect(agent.status).toBe(AgentStatus.DESTROYED);
    await expect(agent.execute({ type: 'test', input: {} })).rejects.toThrow();
  });

  it('stream falls back to execute when doStream is absent', async () => {
    const agent = new TestAgent(baseConfig);
    await agent.init();

    const chunks: string[] = [];
    for await (const chunk of agent.stream({ type: 'test', input: {} })) {
      if (chunk.type === 'text') chunks.push(chunk.content ?? '');
    }

    expect(chunks).toContain('done');
  });
});
