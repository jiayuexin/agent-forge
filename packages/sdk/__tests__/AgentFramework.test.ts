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
  readonly provider = 'static';
  constructor(public config: ModelConfig) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
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

describe('AgentFramework', () => {
  beforeAll(() => {
    ProviderFactory.register('mock', MockProvider);
    ProviderFactory.register('static', StaticProvider);
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
});
