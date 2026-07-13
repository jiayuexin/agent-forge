import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AgentStatus,
  type AgentConfig,
  type AgentResult,
  type AgentTask,
  type IProvider,
  type Logger,
  type ToolCallRequest,
  type ToolDefinition,
} from '@agentforge/types';
import { BaseAgent, type BaseAgentOptions } from '../BaseAgent.js';
import { ProviderFactory } from '../../provider/ProviderFactory.js';
import { MockProvider } from '../../provider/MockProvider.js';
import * as core from '../../index.js';

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

class ExecutorTestAgent extends BaseAgent {
  setProvider(provider: IProvider): void {
    this.provider = provider;
  }

  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return this.createExecutor().execute(task);
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

  it('does not expose the legacy plugin API', () => {
    const agent = new TestAgent(baseConfig);

    expect('use' in agent).toBe(false);
    expect('PluginManager' in core).toBe(false);
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

  it('awaits async event handlers in registration order', async () => {
    const agent = new TestAgent(baseConfig);
    const events: string[] = [];
    agent.on('agent:init', async () => {
      events.push('first:start');
      await Promise.resolve();
      events.push('first:end');
    });
    agent.on('agent:init', () => {
      events.push('second');
    });

    await agent.init();

    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('fails fast when an async event handler rejects', async () => {
    const agent = new TestAgent(baseConfig);
    const laterHandler = vi.fn();
    agent.on('agent:init', async () => {
      throw new Error('init event failed');
    });
    agent.on('agent:init', laterHandler);

    await expect(agent.init()).rejects.toThrow('init event failed');

    expect(laterHandler).not.toHaveBeenCalled();
    expect(agent.status).toBe(AgentStatus.INITIALIZING);
  });

  it('executes configured and dynamic tools through the merged registry', async () => {
    const configuredHandler = vi.fn().mockResolvedValue('configured-result');
    const dynamicHandler = vi.fn().mockResolvedValue('dynamic-result');
    const configuredTool = createTool('configured-tool', configuredHandler);
    const dynamicTool = createTool('dynamic-tool', dynamicHandler);
    const calls: ToolCallRequest[] = [
      { callId: 'call-configured', name: 'configured-tool', args: {} },
      { callId: 'call-dynamic', name: 'dynamic-tool', args: {} },
    ];
    const provider = createToolCallingProvider(calls);
    const options: BaseAgentOptions = {
      toolProvider: () => [dynamicTool],
    };
    const agent = new ExecutorTestAgent({ ...baseConfig, tools: [configuredTool] }, options);
    await agent.init();
    agent.setProvider(provider);

    const result = await agent.execute({ type: 'test', input: {} });

    expect(configuredHandler).toHaveBeenCalledTimes(1);
    expect(dynamicHandler).toHaveBeenCalledTimes(1);
    expect(result.meta.toolsCalled).toEqual([
      expect.objectContaining({ name: 'configured-tool', result: 'configured-result' }),
      expect.objectContaining({ name: 'dynamic-tool', result: 'dynamic-result' }),
    ]);
  });

  it('rejects duplicate names across configured and dynamic tools', async () => {
    const configuredTool = createTool('duplicate-tool');
    const dynamicTool = createTool('duplicate-tool');
    const provider = createToolCallingProvider([]);
    const agent = new ExecutorTestAgent(
      { ...baseConfig, tools: [configuredTool] },
      { toolProvider: () => [dynamicTool] }
    );
    await agent.init();
    agent.setProvider(provider);

    await expect(agent.execute({ type: 'test', input: {} })).rejects.toMatchObject({
      code: 'DUPLICATE_TOOL',
      message: 'Tool "duplicate-tool" is already registered',
    });
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('emits tool call and result events from AgentExecutor', async () => {
    const call = { callId: 'call-1', name: 'test-tool', args: { value: 1 } };
    const provider: IProvider = {
      provider: 'test',
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [call],
          usage: { input: 1, output: 1, total: 2 },
          model: 'test',
          finishReason: 'tool_calls',
        })
        .mockResolvedValueOnce({
          content: 'done',
          usage: { input: 1, output: 1, total: 2 },
          model: 'test',
          finishReason: 'stop',
        }),
      chatStream: async function* () {},
      validate: async () => true,
    };
    const agent = new ExecutorTestAgent({
      ...baseConfig,
      tools: [createTool('test-tool', async () => 'tool-result')],
    });
    const calls: unknown[] = [];
    const results: unknown[] = [];
    agent.on('agent:tool:call', (event) => {
      calls.push(event);
    });
    agent.on('agent:tool:result', (event) => {
      results.push(event);
    });
    await agent.init();
    agent.setProvider(provider);

    await agent.execute({ type: 'test', input: {} });

    expect(calls).toEqual([call]);
    expect(results).toEqual([
      expect.objectContaining({
        name: 'test-tool',
        result: 'tool-result',
        status: 'success',
      }),
    ]);
  });

  it('awaits async tool event handlers before executing the tool', async () => {
    const order: string[] = [];
    const gate = createDeferred();
    const handler = vi.fn().mockImplementation(async () => {
      order.push('tool');
      return 'tool-result';
    });
    const call: ToolCallRequest = {
      callId: 'call-1',
      name: 'test-tool',
      args: {},
    };
    const provider = createToolCallingProvider([call]);
    const agent = new ExecutorTestAgent({
      ...baseConfig,
      tools: [createTool('test-tool', handler)],
    });
    agent.on('agent:tool:call', async () => {
      order.push('event:first:start');
      await gate.promise;
      order.push('event:first:end');
    });
    agent.on('agent:tool:call', () => {
      order.push('event:second');
    });
    await agent.init();
    agent.setProvider(provider);

    const execution = agent.execute({ type: 'test', input: {} });
    await vi.waitFor(() => {
      expect(order).toContain('event:first:start');
    });
    const beforeRelease = [...order];
    gate.resolve();
    await execution;

    expect(beforeRelease).toEqual(['event:first:start']);
    expect(order).toEqual(['event:first:start', 'event:first:end', 'event:second', 'tool']);
  });

  it('forwards maxToolCalls to AgentExecutor', async () => {
    const handler = vi.fn().mockResolvedValue('unused');
    const call: ToolCallRequest = {
      callId: 'call-1',
      name: 'test-tool',
      args: {},
    };
    const provider = createToolCallingProvider([call]);
    const agent = new ExecutorTestAgent(
      {
        ...baseConfig,
        tools: [createTool('test-tool', handler)],
      },
      { maxToolCalls: 0 }
    );
    await agent.init();
    agent.setProvider(provider);

    const result = await agent.execute({ type: 'test', input: {} });

    expect(handler).not.toHaveBeenCalled();
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      error: { code: 'MAX_TOOL_CALLS_EXCEEDED' },
    });
  });

  it('forwards toolAdapters to AgentExecutor', async () => {
    const adapter = vi.fn().mockResolvedValue('adapter-result');
    const endpointTool: ToolDefinition = {
      name: 'endpoint-tool',
      description: 'Endpoint tool',
      parameters: { type: 'object' },
      endpointType: 'local-function',
      endpoint: { target: 'tools.endpoint', method: 'call' },
    };
    const call: ToolCallRequest = {
      callId: 'call-1',
      name: 'endpoint-tool',
      args: { value: 1 },
    };
    const provider = createToolCallingProvider([call]);
    const agent = new ExecutorTestAgent(
      { ...baseConfig, tools: [endpointTool] },
      { toolAdapters: { 'local-function': adapter } }
    );
    await agent.init();
    agent.setProvider(provider);

    const result = await agent.execute({ type: 'test', input: {} });

    expect(adapter).toHaveBeenCalledWith(
      endpointTool,
      call.args,
      expect.objectContaining({ agent })
    );
    expect(result.meta.toolsCalled).toEqual([
      expect.objectContaining({
        name: 'endpoint-tool',
        result: 'adapter-result',
        status: 'success',
      }),
    ]);
  });

  it('forwards a custom logger into tool context', async () => {
    const customLogger = createLogger();
    const handler = vi.fn().mockResolvedValue('tool-result');
    const call: ToolCallRequest = {
      callId: 'call-1',
      name: 'test-tool',
      args: {},
    };
    const provider = createToolCallingProvider([call]);
    const agent = new ExecutorTestAgent(
      {
        ...baseConfig,
        tools: [createTool('test-tool', handler)],
      },
      { logger: customLogger }
    );
    await agent.init();
    agent.setProvider(provider);

    await agent.execute({ type: 'test', input: {} });

    expect(handler).toHaveBeenCalledWith(call.args, {
      agent,
      logger: customLogger,
    });
  });

  it('emits an error tool result event when tool execution fails', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('tool failed'));
    const call: ToolCallRequest = {
      callId: 'call-1',
      name: 'test-tool',
      args: {},
    };
    const provider = createToolCallingProvider([call]);
    const agent = new ExecutorTestAgent(
      {
        ...baseConfig,
        tools: [createTool('test-tool', handler)],
      },
      { logger: createLogger() }
    );
    const resultEvents: unknown[] = [];
    agent.on('agent:tool:result', (event) => {
      resultEvents.push(event);
    });
    await agent.init();
    agent.setProvider(provider);

    const result = await agent.execute({ type: 'test', input: {} });

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: 'Tool "test-tool" execution failed',
      },
      meta: {
        toolsCalled: [
          expect.objectContaining({
            status: 'error',
            error: 'Tool "test-tool" execution failed',
          }),
        ],
      },
    });
    expect(resultEvents).toHaveLength(1);
    expect(resultEvents[0]).toBe(result.meta.toolsCalled?.[0]);
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

function createTool(
  name: string,
  handler: ToolDefinition['handler'] = async () => undefined
): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: 'object' },
    handler,
  };
}

function createToolCallingProvider(calls: ToolCallRequest[]): IProvider {
  return {
    provider: 'test',
    chat: vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: calls,
        usage: { input: 1, output: 1, total: 2 },
        model: 'test',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: 'done',
        usage: { input: 1, output: 1, total: 2 },
        model: 'test',
        finishReason: 'stop',
      }),
    chatStream: async function* () {},
    validate: async () => true,
  };
}

function createLogger(): Logger {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
  vi.mocked(logger.child).mockReturnValue(logger);
  return logger;
}

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
