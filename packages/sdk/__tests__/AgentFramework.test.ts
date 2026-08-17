import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BaseAgent, MockProvider, ProviderFactory } from '@agentforge/core';
import type {
  AgentConfig,
  AgentResult,
  AgentTask,
  ChatParams,
  ChatResponse,
  IProvider,
  ModelConfig,
} from '@agentforge/types';
import { AgentFramework } from '../src/AgentFramework.js';

class MockAgent extends BaseAgent<AgentConfig> {
  private handler: (task: AgentTask) => AgentResult;

  constructor(name: string, handler: (task: AgentTask) => AgentResult) {
    super({
      identity: { id: `agent-${name}`, name, role: name, version: '1.0.0' },
      model: { provider: 'mock', modelName: 'mock', apiKey: '' },
      systemPrompt: `You are ${name}.`,
      capabilities: [{ name: 'work', description: `Work done by ${name}` }],
    });
    this.handler = handler;
  }

  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return this.handler(task);
  }
}

class StaticProvider implements IProvider {
  static lastParams: ChatParams | undefined;
  readonly provider = 'static';
  constructor(public config: ModelConfig) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    StaticProvider.lastParams = params;
    const response = (this.config as unknown as Record<string, unknown>).extra?.response as string;
    return {
      content: response ?? `static: ${params.messages[params.messages.length - 1]?.content ?? ''}`,
      usage: { input: 0, output: 0, total: 0 },
      model: 'static',
      finishReason: 'stop',
    };
  }

  async *chatStream() {
    yield { type: 'done' };
  }

  async validate() {
    return true;
  }
}

class ToolCallingProvider implements IProvider {
  readonly provider = 'tool-calling';

  constructor(public config: ModelConfig) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const toolResult = params.messages.find((message) => message.role === 'tool');
    if (!toolResult) {
      return {
        content: '',
        toolCalls: [
          {
            name: 'allowed-tool',
            args: { value: 2 },
            callId: 'call-1',
          },
        ],
        usage: { input: 1, output: 1, total: 2 },
        model: 'tool-calling',
        finishReason: 'tool_call',
      };
    }
    return {
      content: `skill used ${toolResult.content}`,
      usage: { input: 1, output: 1, total: 2 },
      model: 'tool-calling',
      finishReason: 'stop',
    };
  }

  async *chatStream() {
    yield { type: 'done' };
  }

  async validate() {
    return true;
  }
}

describe('AgentFramework', () => {
  beforeAll(() => {
    ProviderFactory.register('mock', MockProvider);
    ProviderFactory.register('static', StaticProvider);
    ProviderFactory.register('tool-calling', ToolCallingProvider);
  });

  it('registers agents and runs them', async () => {
    const framework = new AgentFramework();
    framework.register(
      'greeter',
      class extends MockAgent {
        constructor() {
          super('greeter', (task) => ({
            success: true,
            output: { content: `Hello ${task.input.name}` },
            meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
          }));
        }
      }
    );

    await framework.init();
    const result = await framework.run('greeter', { type: 'greet', input: { name: 'world' } });
    expect(result.output.content).toBe('Hello world');
  });

  it('registers explicit metadata as an Agent capability', () => {
    const framework = new AgentFramework();
    framework.register(
      'reviewer',
      class extends MockAgent {
        constructor() {
          super('reviewer', () => ({
            success: true,
            output: { content: 'reviewed' },
            meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
          }));
        }
      },
      {
        name: 'review',
        description: 'Reviews changes',
      }
    );

    expect(framework.discovery.get('reviewer:review')).toMatchObject({
      id: 'reviewer:review',
      type: 'agent',
      name: 'review',
      description: 'Reviews changes',
    });
  });

  it('binds an explicit Agent capability to its instance and executes it end to end', async () => {
    const framework = new AgentFramework();
    framework.register(
      'reviewer',
      class extends MockAgent {
        constructor() {
          super('reviewer', (task) => ({
            success: true,
            output: { content: `reviewed ${String(task.input.change)}` },
            meta: {
              duration: 0,
              tokensUsed: { input: 0, output: 0, total: 0 },
              model: 'mock',
            },
          }));
        }
      },
      {
        id: 'reviewer:explicit-review',
        name: 'review',
        description: 'Reviews changes',
      }
    );

    await framework.init();

    await expect(
      framework.executeCapability('reviewer:explicit-review', {
        type: 'review',
        input: { change: 'patch' },
      })
    ).resolves.toMatchObject({
      success: true,
      output: { content: 'reviewed patch' },
    });
  });

  it('auto-initializes on run', async () => {
    const framework = new AgentFramework();
    framework.register(
      'adder',
      class extends MockAgent {
        constructor() {
          super('adder', (task) => ({
            success: true,
            output: { content: String(Number(task.input.a) + Number(task.input.b)) },
            meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
          }));
        }
      }
    );

    const result = await framework.run('adder', { type: 'add', input: { a: 1, b: 2 } });
    expect(result.output.content).toBe('3');
  });

  it('plans using the planner agent', async () => {
    const planResponse = JSON.stringify({
      goal: 'Greet',
      capabilitiesUsed: ['agent-greeter:work'],
      steps: [
        {
          id: 's1',
          name: 'greet',
          capability: 'agent-greeter:work',
          type: 'agent',
          task: 'Greet the user',
          input: {},
        },
      ],
    });

    const framework = new AgentFramework({
      modelRegistry: {
        endpoints: [
          {
            id: 'static-endpoint',
            baseUrl: 'http://localhost',
            provider: 'static',
            models: ['static'],
            extra: {},
          },
        ],
        defaultEndpoint: 'static-endpoint',
        defaultModel: 'static',
      },
    });

    framework.register(
      'greeter',
      class extends MockAgent {
        constructor() {
          super('greeter', () => ({
            success: true,
            output: { content: 'hello' },
            meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
          }));
        }
      },
      { id: 'agent-greeter:work', name: 'work', description: 'Greets', type: 'agent' }
    );

    // Override the static response by mutating the endpoint extra after registration.
    framework['config'].modelRegistry!.endpoints[0].extra = { response: planResponse };

    await framework.init();
    const plan = await framework.plan({ type: 'chat', input: { message: 'say hi' } });
    expect(plan.goal).toBe('Greet');
  });

  it('orchestrates a plan end to end', async () => {
    const planResponse = JSON.stringify({
      goal: 'Greet',
      capabilitiesUsed: ['agent-greeter:work'],
      steps: [
        {
          id: 's1',
          name: 'greet',
          capability: 'agent-greeter:work',
          type: 'agent',
          task: 'Greet the user',
          input: {},
        },
      ],
    });

    const framework = new AgentFramework({
      modelRegistry: {
        endpoints: [
          {
            id: 'static-endpoint',
            baseUrl: 'http://localhost',
            provider: 'static',
            models: ['static'],
            extra: {},
          },
        ],
        defaultEndpoint: 'static-endpoint',
        defaultModel: 'static',
      },
    });

    framework.register(
      'greeter',
      class extends MockAgent {
        constructor() {
          super('greeter', () => ({
            success: true,
            output: { content: 'hello from greeter' },
            meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
          }));
        }
      },
      { id: 'agent-greeter:work', name: 'work', description: 'Greets', type: 'agent' }
    );

    framework['config'].modelRegistry!.endpoints[0].extra = { response: planResponse };

    const result = await framework.orchestrate({ type: 'chat', input: { message: 'say hi' } });
    expect(result.success).toBe(true);
    expect(result.output.content).toBe('hello from greeter');
  });

  it('returns a pipeline attached to the framework', async () => {
    const framework = new AgentFramework();
    framework.register(
      'echo',
      class extends MockAgent {
        constructor() {
          super('echo', (task) => ({
            success: true,
            output: { content: String(task.input.value) },
            meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
          }));
        }
      }
    );

    await framework.init();
    const pipeline = framework.pipeline('test').add('echo', {
      agent: 'echo',
      task: 'echo',
      input: { value: 'ping' },
    });

    const result = await pipeline.run();
    expect(result.finalOutput.output.content).toBe('ping');
  });

  it('emits events through the event bus', async () => {
    const framework = new AgentFramework();
    const handler = vi.fn();
    framework.on('custom', handler);
    framework.emit('custom', { value: 1 });
    expect(handler).toHaveBeenCalledWith({ value: 1 });
  });

  it('connectToClientAgent returns a proxy when invoker is set', async () => {
    const framework = new AgentFramework();
    const invoker = {
      execute: vi.fn(async () => ({
        success: true,
        output: { content: 'remote' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'remote' },
      })),
    };
    framework.setRemoteAgentInvoker(invoker);
    const proxy = await framework.connectToClientAgent('node-1');
    expect(proxy.nodeId).toBe('node-1');
  });

  it('executes ToolCapability through explicitly injected endpoint adapters', async () => {
    const framework = new AgentFramework();
    framework.discovery.register({
      id: 'tool:add',
      type: 'tool',
      name: 'add',
      description: 'Adds numbers',
      endpointType: 'local-function',
      endpoint: { target: 'math.add' },
      inputSchema: { type: 'object' },
    });
    const adapter = vi.fn(async (_tool, args) => Number(args.left) + Number(args.right));
    framework.setToolAdapters({ 'local-function': adapter });

    const result = await framework.executeCapability('tool:add', {
      type: 'tool',
      input: { left: 2, right: 3 },
    });

    expect(result).toMatchObject({
      success: true,
      output: { structured: { result: 5 } },
      meta: {
        toolsCalled: [
          {
            name: 'add',
            args: { left: 2, right: 3 },
            result: 5,
            status: 'success',
          },
        ],
      },
    });
    expect(adapter).toHaveBeenCalledOnce();
  });

  it('delegates PluginCapability only to an explicitly injected runtime', async () => {
    const framework = new AgentFramework();
    const plugin = {
      id: 'plugin:test',
      type: 'plugin',
      name: 'test-plugin',
      description: 'Runs a plugin',
      downloadUrl: 'https://example.com/plugin.wasm',
      signature: 'signature',
      keyId: 'key-1',
      entry: 'plugin.wasm',
      allowedCapabilities: [],
      sandbox: { timeoutMs: 1_000, maxMemoryPages: 1 },
    } as const;
    framework.discovery.register(plugin);

    await expect(
      framework.executeCapability(plugin.id, { type: 'plugin', input: {} })
    ).rejects.toMatchObject({ code: 'PLUGIN_RUNTIME_NOT_CONFIGURED' });

    const expected: AgentResult = {
      success: true,
      output: { content: 'plugin result' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'plugin',
      },
    };
    const invoker = { execute: vi.fn(async () => expected) };
    framework.setPluginInvoker(invoker);

    await expect(
      framework.executeCapability(plugin.id, { type: 'plugin', input: {} })
    ).resolves.toBe(expected);
    expect(invoker.execute).toHaveBeenCalledOnce();
  });

  it('keeps an immutable call stack and rejects nested capability cycles', async () => {
    const framework = new AgentFramework();
    const plugin = {
      id: 'plugin:cycle',
      type: 'plugin',
      name: 'cycle-plugin',
      description: 'Attempts to invoke itself',
      downloadUrl: 'https://example.com/cycle.wasm',
      signature: 'signature',
      keyId: 'key-1',
      entry: 'cycle.wasm',
      allowedCapabilities: ['plugin:cycle'],
      sandbox: { timeoutMs: 1_000, maxMemoryPages: 1 },
    } as const;
    framework.discovery.register(plugin);
    framework.setPluginInvoker({
      execute: vi.fn(async (_capability, nestedTask, context) => {
        expect(Object.isFrozen(context.callStack)).toBe(true);
        if (context.callStack.length > 1) {
          throw new Error('cycle was not rejected before reinvocation');
        }
        return context.executeCapability(plugin.id, nestedTask);
      }),
    });

    await expect(
      framework.executeCapability(plugin.id, { type: 'plugin', input: {} })
    ).rejects.toMatchObject({
      code: 'CAPABILITY_EXECUTION_CYCLE',
      details: { callStack: [plugin.id, plugin.id] },
    });
  });

  it('rejects nested capability execution beyond maxCapabilityDepth', async () => {
    const framework = new AgentFramework({ maxCapabilityDepth: 2 });
    const plugin = (id: string) =>
      ({
        id,
        type: 'plugin',
        name: id,
        description: `Runs ${id}`,
        downloadUrl: `https://example.com/${id}.wasm`,
        signature: 'signature',
        keyId: 'key-1',
        entry: `${id}.wasm`,
        allowedCapabilities: [],
        sandbox: { timeoutMs: 1_000, maxMemoryPages: 1 },
      }) as const;
    for (const id of ['plugin:first', 'plugin:second', 'plugin:third']) {
      framework.discovery.register(plugin(id));
    }
    framework.setPluginInvoker({
      execute: vi.fn(async (current, nestedTask, context) => {
        if (current.id === 'plugin:first') {
          return context.executeCapability('plugin:second', nestedTask);
        }
        if (current.id === 'plugin:second') {
          return context.executeCapability('plugin:third', nestedTask);
        }
        return {
          success: true,
          output: { content: 'depth was not enforced' },
          meta: {
            duration: 0,
            tokensUsed: { input: 0, output: 0, total: 0 },
            model: 'plugin',
          },
        };
      }),
    });

    await expect(
      framework.executeCapability('plugin:first', { type: 'plugin', input: {} })
    ).rejects.toMatchObject({
      code: 'MAX_CAPABILITY_DEPTH_EXCEEDED',
      details: {
        maxDepth: 2,
        callStack: ['plugin:first', 'plugin:second', 'plugin:third'],
      },
    });
  });

  it('only exposes currently executable capabilities to the Planner', async () => {
    const planResponse = JSON.stringify({
      goal: 'Nothing to do',
      capabilitiesUsed: [],
      steps: [],
    });
    const framework = new AgentFramework({
      modelRegistry: {
        endpoints: [
          {
            id: 'static-endpoint',
            baseUrl: 'http://localhost',
            provider: 'static',
            models: ['static'],
            extra: { response: planResponse },
          },
        ],
        defaultEndpoint: 'static-endpoint',
        defaultModel: 'static',
      },
    });
    const plugin = {
      id: 'plugin:planner-visible',
      type: 'plugin',
      name: 'planner-visible',
      description: 'Visible only with a configured runtime',
      downloadUrl: 'https://example.com/plugin.wasm',
      signature: 'signature',
      keyId: 'key-1',
      entry: 'plugin.wasm',
      allowedCapabilities: [],
      sandbox: { timeoutMs: 1_000, maxMemoryPages: 1 },
    } as const;
    framework.discovery.register(plugin);

    await framework.plan({ type: 'plan', input: { goal: 'test filtering' } });
    expect(StaticProvider.lastParams?.messages.at(-1)?.content).not.toContain(plugin.id);

    framework.setPluginInvoker({
      execute: vi.fn(async () => ({
        success: true,
        output: { content: 'plugin' },
        meta: {
          duration: 0,
          tokensUsed: { input: 0, output: 0, total: 0 },
          model: 'plugin',
        },
      })),
    });
    await framework.plan({ type: 'plan', input: { goal: 'test filtering' } });
    expect(StaticProvider.lastParams?.messages.at(-1)?.content).toContain(plugin.id);
  });

  it('executes SkillCapability with the production temporary StatelessAgent', async () => {
    const framework = new AgentFramework({
      modelRegistry: {
        endpoints: [
          {
            id: 'tool-calling-endpoint',
            baseUrl: 'http://localhost',
            provider: 'tool-calling',
            models: ['tool-calling'],
          },
        ],
        defaultEndpoint: 'tool-calling-endpoint',
        defaultModel: 'tool-calling',
      },
    });
    framework.discovery.register({
      id: 'tool:allowed',
      type: 'tool',
      name: 'allowed-tool',
      description: 'Allowed by the skill',
      endpointType: 'local-function',
      endpoint: { target: 'tools.allowed' },
      inputSchema: { type: 'object' },
    });
    framework.discovery.register({
      id: 'skill:real-temporary-agent',
      type: 'skill',
      name: 'real-temporary-agent',
      description: 'Uses a real temporary StatelessAgent',
      tools: ['tool:allowed'],
      promptTemplate: 'Use the allowed tool.',
    });
    const adapter = vi.fn(async (_tool, args) => ({
      doubled: Number(args.value) * 2,
    }));
    framework.setToolAdapters({ 'local-function': adapter });

    const result = await framework.executeCapability('skill:real-temporary-agent', {
      type: 'skill',
      input: { request: 'run' },
    });

    expect(result).toMatchObject({
      success: true,
      output: { content: 'skill used {"doubled":4}' },
      meta: {
        model: 'tool-calling',
        toolsCalled: [
          {
            name: 'allowed-tool',
            status: 'success',
            result: { doubled: 4 },
          },
        ],
      },
    });
    expect(adapter).toHaveBeenCalledOnce();
  });

  it('get throws AgentNotFoundError for unknown agent', () => {
    const framework = new AgentFramework();
    expect(() => framework.get('missing')).toThrow('Agent "missing" is not registered');
  });

  it('run throws AgentNotFoundError when agent is not registered', async () => {
    const framework = new AgentFramework();
    await expect(framework.run('missing', { type: 'test', input: {} })).rejects.toThrow(
      'Agent "missing" is not registered'
    );
  });

  it('destroy clears instances and allows re-registration', async () => {
    const framework = new AgentFramework();
    const createEchoAgent = () =>
      class extends MockAgent {
        constructor() {
          super('echo', (task) => ({
            success: true,
            output: { content: String(task.input.value) },
            meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
          }));
        }
      };

    framework.register('echo', createEchoAgent());
    await framework.init();
    expect(framework.get('echo')).toBeDefined();

    await framework.destroy();
    expect(() => framework.get('echo')).toThrow('Agent "echo" is not registered');

    framework.register('echo', createEchoAgent());
    const result = await framework.run('echo', { type: 'echo', input: { value: 'again' } });
    expect(result.output.content).toBe('again');
  });

  it('event bus supports once, off, and removeAllListeners', async () => {
    const framework = new AgentFramework();
    const handler = vi.fn();

    framework.once('evt', handler);
    framework.emit('evt', 1);
    framework.emit('evt', 2);
    expect(handler).toHaveBeenCalledTimes(1);

    const handler2 = vi.fn();
    framework.on('evt2', handler2);
    framework.off('evt2', handler2);
    framework.emit('evt2', 1);
    expect(handler2).not.toHaveBeenCalled();

    const handler3 = vi.fn();
    framework.on('evt3', handler3);
    framework.removeAllListeners('evt3');
    framework.emit('evt3', 1);
    expect(handler3).not.toHaveBeenCalled();
  });

  it('executeCapability throws for missing capability', async () => {
    const framework = new AgentFramework();
    await expect(
      (
        framework as unknown as {
          executeCapability: (id: string, task: AgentTask) => Promise<AgentResult>;
        }
      ).executeCapability('missing', { type: 'test', input: {} })
    ).rejects.toMatchObject({ code: 'CAPABILITY_NOT_FOUND' });
  });

  it('executeCapability throws for missing agent provider', async () => {
    const framework = new AgentFramework();
    (framework.discovery as ICapabilityRegistry).register({
      id: 'orphan-capability',
      type: 'agent',
      name: 'orphan',
      description: 'No agent provides this',
    });

    await expect(
      (
        framework as unknown as {
          executeCapability: (id: string, task: AgentTask) => Promise<AgentResult>;
        }
      ).executeCapability('orphan-capability', { type: 'test', input: {} })
    ).rejects.toMatchObject({ code: 'CAPABILITY_AGENT_NOT_FOUND' });
  });

  it('executePlan lazily creates planner and executor', async () => {
    const planResponse = JSON.stringify({
      goal: 'Greet',
      capabilitiesUsed: ['agent-greeter:work'],
      steps: [
        {
          id: 's1',
          name: 'greet',
          capability: 'agent-greeter:work',
          type: 'agent',
          task: 'Greet the user',
          input: {},
        },
      ],
    });

    const framework = new AgentFramework({
      modelRegistry: {
        endpoints: [
          {
            id: 'static-endpoint',
            baseUrl: 'http://localhost',
            provider: 'static',
            models: ['static'],
            extra: {},
          },
        ],
        defaultEndpoint: 'static-endpoint',
        defaultModel: 'static',
      },
    });

    framework.register(
      'greeter',
      class extends MockAgent {
        constructor() {
          super('greeter', () => ({
            success: true,
            output: { content: 'hello from greeter' },
            meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
          }));
        }
      },
      { id: 'agent-greeter:work', name: 'work', description: 'Greets', type: 'agent' }
    );

    framework['config'].modelRegistry!.endpoints[0].extra = { response: planResponse };

    const result = await framework.executePlan(
      {
        goal: 'Greet',
        capabilitiesUsed: ['agent-greeter:work'],
        steps: [
          {
            id: 's1',
            name: 'greet',
            capability: 'agent-greeter:work',
            type: 'agent',
            task: { type: 'greet', input: {} },
            input: {},
          },
        ],
      },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.output.content).toBe('hello from greeter');
  });
});
