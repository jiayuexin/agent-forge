import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from '../src/Pipeline.js';
import { ModelNotFoundError } from '../src/errors.js';
import type { AgentResult, AgentTask, IAgent, ModelConfig } from '@agentforge/types';
import { AgentStatus } from '@agentforge/types';

function createMockAgent(name: string, handler: (task: AgentTask) => Promise<AgentResult> | AgentResult): IAgent {
  return {
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
}

function createRuntime(agents: Record<string, IAgent>) {
  return {
    getAgent: (name: string) => {
      const agent = agents[name];
      if (!agent) throw new Error(`Agent ${name} not found`);
      return agent;
    },
    resolveModel: vi.fn((model?: string, defaultModel?: string) => {
      if (model === 'unknown') throw new ModelNotFoundError(model);
      return { provider: 'mock', modelName: String(model ?? defaultModel ?? 'mock') } as ModelConfig;
    }),
    emit: vi.fn(),
  };
}

describe('Pipeline', () => {
  it('executes serial steps', async () => {
    const agents = {
      a: createMockAgent('a', (task) => ({
        success: true,
        output: { content: `a:${task.input.task}` },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      b: createMockAgent('b', (task) => ({
        success: true,
        output: { content: `b:${task.input.task}` },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('step1', { agent: 'a', task: 'hello' })
      .add('step2', { agent: 'b', task: 'world' });

    const result = await pipeline.run();
    expect(result.success).toBe(true);
    expect(result.finalOutput.output.content).toBe('b:world');
    expect(result.steps).toHaveLength(2);
  });

  it('passes previous output to the next step by default', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'first', structured: { value: 42 } },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      b: createMockAgent('b', (task) => ({
        success: true,
        output: { content: `second-${JSON.stringify(task.input)}` },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('step1', { agent: 'a', task: 'hello' })
      .add('step2', { agent: 'b', task: 'world' });

    const result = await pipeline.run();
    expect(result.finalOutput.output.content).toContain('42');
  });

  it('executes parallel steps and combines outputs', async () => {
    const agents = {
      left: createMockAgent('left', () => ({
        success: true,
        output: { content: 'left-result' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      right: createMockAgent('right', () => ({
        success: true,
        output: { content: 'right-result' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .parallel([
        { name: 'left', agent: 'left', task: 'run-left' },
        { name: 'right', agent: 'right', task: 'run-right' },
      ]);

    const result = await pipeline.run();
    expect(result.success).toBe(true);
    expect(result.finalOutput.output.structured?.branches).toBeDefined();
  });

  it('executes a branch decider returning a single step', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'start', structured: { go: 'yes' } },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      b: createMockAgent('b', () => ({
        success: true,
        output: { content: 'branch-result' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('start', { agent: 'a', task: 'start' })
      .branch((prev) =>
        prev.output.structured?.go === 'yes'
          ? { agent: 'b', task: 'chosen' }
          : { agent: 'b', task: 'default' }
      );

    const result = await pipeline.run();
    expect(result.finalOutput.output.content).toBe('branch-result');
  });

  it('executes a branch decider returning parallel steps', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'start' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      b: createMockAgent('b', () => ({
        success: true,
        output: { content: 'b-result' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      c: createMockAgent('c', () => ({
        success: true,
        output: { content: 'c-result' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('start', { agent: 'a', task: 'start' })
      .branch(() => [
        { name: 'b', agent: 'b', task: 'run-b' },
        { name: 'c', agent: 'c', task: 'run-c' },
      ]);

    const result = await pipeline.run();
    expect(result.finalOutput.output.structured?.branches).toBeDefined();
  });

  it('executes fork branches concurrently', async () => {
    const agents = {
      x: createMockAgent('x', () => ({
        success: true,
        output: { content: 'x' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
      y: createMockAgent('y', () => ({
        success: true,
        output: { content: 'y' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .fork([
        { name: 'x-branch', agent: 'x', task: 'run-x' },
        { name: 'y-branch', agent: 'y', task: 'run-y' },
      ]);

    const result = await pipeline.run();
    expect(result.success).toBe(true);
    expect(result.finalOutput.output.structured?.branches).toBeDefined();
  });

  it('validates step model references', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'ok' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('step1', { agent: 'a', task: 'hello', model: 'unknown' });

    await expect(pipeline.run()).rejects.toThrow(ModelNotFoundError);
  });

  it('applies interceptors that return a control signal', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'a' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('step1', { agent: 'a', task: 'hello' })
      .intercept({
        stepName: 'step1',
        handler: () => ({ action: 'stop' }),
      });

    const result = await pipeline.run();
    expect(result.success).toBe(true);
    expect(result.finalOutput.output.content).toBe('a');
    expect(result.steps).toHaveLength(1);
  });

  it('applies step-level intercept', async () => {
    const agents = {
      a: createMockAgent('a', () => ({
        success: true,
        output: { content: 'a' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      })),
    };

    const pipeline = new Pipeline()
      .attachRuntime(createRuntime(agents))
      .add('step1', {
        agent: 'a',
        task: 'hello',
        intercept: () => ({ action: 'stop' }),
      });

    const result = await pipeline.run();
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
  });
});
