import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from '../src/Pipeline.js';
import { PipelineError } from '../src/errors.js';
import type { AgentResult, AgentTask, IAgent, ISnapshotable, ModelConfig } from '@agentforge/types';
import { AgentStatus } from '@agentforge/types';

function createMockAgent(
  name: string,
  handler: (task: AgentTask) => Promise<AgentResult> | AgentResult,
  snapshotable?: ISnapshotable
): IAgent {
  const agent: IAgent = {
    id: `id-${name}`,
    name,
    role: name,
    version: '1.0.0',
    capabilities: [],
    status: AgentStatus.READY,
    async init() {},
    execute: async (task) => handler(task),
    async *stream(task) {
      const result = await handler(task);
      yield { type: 'text', content: result.output.content, index: 0 };
      yield { type: 'done', index: 1 };
    },
    async destroy() {},
    use() {
      return this;
    },
    on() {
      return this;
    },
    off() {
      return this;
    },
  };
  if (snapshotable) {
    Object.assign(agent, snapshotable);
  }
  return agent;
}

function createRuntime(agents: Record<string, IAgent>) {
  return {
    getAgent: (name: string) => {
      const agent = agents[name];
      if (!agent) throw new Error(`Agent ${name} not found`);
      return agent;
    },
    resolveModel: vi.fn((model?: string, defaultModel?: string) => {
      return { provider: 'mock', modelName: String(model ?? defaultModel ?? 'mock') } as ModelConfig;
    }),
    emit: vi.fn(),
  };
}

describe('Pipeline backtrack and control signals', () => {
  it('back builder loops to a previous step on failure', async () => {
    let count = 0;
    const agents = {
      checker: createMockAgent('checker', () => {
        count++;
        return {
          success: count > 1,
          output: { content: `check-${count}` },
          meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
        };
      }),
      stopper: createMockAgent('stopper', () => ({
        success: true,
        output: { content: 'stopped' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .config({ defaultMaxRetry: 5 })
      .add('check', { agent: 'checker', task: 'check' })
      .back('check')
      .add('stop', { agent: 'stopper', task: 'stop', intercept: () => ({ action: 'stop' }) });

    const result = await pipeline.run();
    expect(result.success).toBe(true);
    expect(result.backtrackHistory).toHaveLength(1);
    expect(count).toBe(2);
    expect(result.finalOutput.output.content).toBe('stopped');
  });

  it('step intercept jump moves to a target step', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'a' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      b: createMockAgent('b', () => ({
        success: true,
        output: { content: 'b' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('first', {
        agent: 'a',
        task: 'run',
        intercept: () => ({ action: 'jump', targetStep: 'second' }),
      })
      .add('second', { agent: 'b', task: 'run' });

    const result = await pipeline.run();
    expect(result.success).toBe(true);
    expect(result.finalOutput.output.content).toBe('b');
    expect(result.steps).toHaveLength(2);
  });

  it('stop terminates the pipeline immediately', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'a' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      b: createMockAgent('b', () => ({
        success: true,
        output: { content: 'b' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('first', {
        agent: 'a',
        task: 'run',
        intercept: () => ({ action: 'stop' }),
      })
      .add('second', { agent: 'b', task: 'run' });

    const result = await pipeline.run();
    expect(result.success).toBe(true);
    expect(result.finalOutput.output.content).toBe('a');
    expect(result.steps).toHaveLength(1);
  });

  it('throws when pause is requested', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'a' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('first', {
        agent: 'a',
        task: 'run',
        intercept: () => ({ action: 'pause' }),
      });

    await expect(pipeline.run()).rejects.toThrow(PipelineError);
  });

  it('stops when maxBacktracks is exceeded', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'a' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .config({ maxBacktracks: 1, defaultMaxRetry: 10 })
      .add('first', {
        agent: 'a',
        task: 'run',
        intercept: () => ({ action: 'back', targetStep: 'first' }),
      });

    const result = await pipeline.run();
    expect(result.success).toBe(false);
    expect(result.backtrackHistory).toHaveLength(2);
  });

  it('stops when per-step retry limit is exceeded', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'a' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .config({ defaultMaxRetry: 2 })
      .add('first', {
        agent: 'a',
        task: 'run',
        intercept: () => ({ action: 'back', targetStep: 'first' }),
      });

    const result = await pipeline.run();
    expect(result.success).toBe(false);
  });

  it('restores snapshotable agents on backtrack', async () => {
    const restore = vi.fn();
    const agents = {
      a: createMockAgent(
        'a',
        () => ({
          success: true,
          output: { content: 'a' },
          meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
        }),
        {
          snapshot: async () => ({}),
          restore,
        }
      ),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .config({ defaultMaxRetry: 5 })
      .add('first', {
        agent: 'a',
        task: 'run',
        intercept: () => ({ action: 'back', targetStep: 'first' }),
      });

    await pipeline.run();
    expect(restore).toHaveBeenCalled();
  });

  it('throws for unsupported runtime fork signal', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'a' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('first', {
        agent: 'a',
        task: 'run',
        intercept: () => ({ action: 'fork', targetStep: 'first' }),
      });

    await expect(pipeline.run()).rejects.toThrow(PipelineError);
  });
});
