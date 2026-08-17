import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StatelessAgent } from '../StatelessAgent.js';
import type {
  IProvider,
  StatelessAgentConfig,
  ToolCallRequest,
  ToolDefinition,
} from '@agentforge/types';
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

  it('executes configured and dynamic tool handlers end to end', async () => {
    const configuredHandler = vi.fn().mockResolvedValue('configured-result');
    const dynamicHandler = vi.fn().mockResolvedValue('dynamic-result');
    const configuredTool = createTool('configured-tool', configuredHandler);
    const dynamicTool = createTool('dynamic-tool', dynamicHandler);
    const calls: ToolCallRequest[] = [
      { callId: 'call-1', name: 'configured-tool', args: { value: 1 } },
      { callId: 'call-2', name: 'dynamic-tool', args: { value: 2 } },
    ];
    const provider = createToolProvider(calls);
    const agent = new StatelessAgent(
      { ...statelessConfig, tools: [configuredTool] },
      { toolProvider: () => [dynamicTool] }
    );
    await agent.init();
    (agent as unknown as { provider: IProvider }).provider = provider;

    const result = await agent.execute({ type: 'test', input: {} });

    expect(configuredHandler).toHaveBeenCalledTimes(1);
    expect(dynamicHandler).toHaveBeenCalledTimes(1);
    expect(provider.chat).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tools: [
          expect.objectContaining({ name: 'configured-tool' }),
          expect.objectContaining({ name: 'dynamic-tool' }),
        ],
      })
    );
    expect(result).toMatchObject({
      success: true,
      output: { content: 'all tools complete' },
      meta: {
        toolsCalled: [
          expect.objectContaining({ name: 'configured-tool', result: 'configured-result' }),
          expect.objectContaining({ name: 'dynamic-tool', result: 'dynamic-result' }),
        ],
      },
    });
  });
});

function createTool(name: string, handler: ToolDefinition['handler']): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: 'object' },
    handler,
  };
}

function createToolProvider(calls: ToolCallRequest[]): IProvider {
  return {
    provider: 'tool-test',
    chat: vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: calls,
        usage: { input: 1, output: 1, total: 2 },
        model: 'tool-test',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: 'all tools complete',
        usage: { input: 1, output: 1, total: 2 },
        model: 'tool-test',
        finishReason: 'stop',
      }),
    chatStream: async function* () {},
    validate: async () => true,
  };
}
