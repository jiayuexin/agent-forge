import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '@agentforge/core';
import type { AgentTask, AgentResult, AgentConfig } from '@agentforge/types';
import { AgentRegistry } from '@agentforge/core';
import { Pipeline } from '../Pipeline';
import { EventBus } from '../EventBus';
import { AgentFramework } from '../AgentFramework';

// --- Mock agent for testing ---

class MockAgent extends BaseAgent<AgentConfig> {
  private executeFn: (task: AgentTask) => Promise<AgentResult>;

  constructor(
    name: string,
    executeFn?: (task: AgentTask) => Promise<AgentResult>,
  ) {
    super({ name, role: 'mock' });
    this.executeFn =
      executeFn ??
      (async (task: AgentTask) => ({
        success: true,
        output: { content: `${name}: ${task.input.message ?? 'no-input'}` },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      }));
  }

  protected async doInit(): Promise<void> {
    // no-op
  }

  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return this.executeFn(task);
  }
}

// --- Helper to set up a registry with agents ---

function makeRegistry(
  agents: Record<string, MockAgent>,
): AgentRegistry {
  const registry = new AgentRegistry();
  for (const [name, agent] of Object.entries(agents)) {
    registry.register(name, agent);
  }
  return registry;
}

const defaultConfig: AgentConfig = {
  model: { provider: 'openai', modelName: 'gpt-4', apiKey: 'test' },
  systemPrompt: 'test',
};

async function initAgents(
  agents: Record<string, MockAgent>,
): Promise<void> {
  for (const agent of Object.values(agents)) {
    await agent.init(defaultConfig);
  }
}

// =====================================================================
// EventBus tests
// =====================================================================

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('on() registers a handler that is called on emit()', () => {
    const handler = vi.fn();
    bus.on('test-event', handler);
    bus.emit('test-event', 'arg1', 'arg2');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('multiple handlers for the same event are all called', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('ev', h1);
    bus.on('ev', h2);
    bus.emit('ev');
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('once() handler is called only once', () => {
    const handler = vi.fn();
    bus.once('ev', handler);
    bus.emit('ev');
    bus.emit('ev');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('off() removes a specific handler', () => {
    const handler = vi.fn();
    bus.on('ev', handler);
    bus.off('ev', handler);
    bus.emit('ev');
    expect(handler).not.toHaveBeenCalled();
  });

  it('emit() on unknown event does not throw', () => {
    expect(() => bus.emit('no-such-event')).not.toThrow();
  });

  it('handler errors do not break other handlers or emit()', () => {
    const badHandler = vi.fn(() => {
      throw new Error('oops');
    });
    const goodHandler = vi.fn();
    bus.on('ev', badHandler);
    bus.on('ev', goodHandler);
    expect(() => bus.emit('ev')).not.toThrow();
    expect(badHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();
  });

  it('removeAllListeners(event) removes all handlers for that event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('ev', h1);
    bus.on('ev', h2);
    bus.removeAllListeners('ev');
    bus.emit('ev');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('removeAllListeners() removes all handlers for all events', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('ev1', h1);
    bus.on('ev2', h2);
    bus.removeAllListeners();
    bus.emit('ev1');
    bus.emit('ev2');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('on() returns this for chaining', () => {
    const result = bus.on('ev', vi.fn());
    expect(result).toBe(bus);
  });

  it('once() returns this for chaining', () => {
    const result = bus.once('ev', vi.fn());
    expect(result).toBe(bus);
  });

  it('off() returns this for chaining', () => {
    const handler = vi.fn();
    bus.on('ev', handler);
    const result = bus.off('ev', handler);
    expect(result).toBe(bus);
  });

  it('removeAllListeners() returns this for chaining', () => {
    const result = bus.removeAllListeners();
    expect(result).toBe(bus);
  });
});

// =====================================================================
// Pipeline tests
// =====================================================================

describe('Pipeline', () => {
  it('executes steps sequentially and passes output through', async () => {
    const agentA = new MockAgent('agent-a');
    const agentB = new MockAgent('agent-b');
    const agentC = new MockAgent('agent-c');
    await initAgents({ a: agentA, b: agentB, c: agentC });

    const registry = makeRegistry({ a: agentA, b: agentB, c: agentC });
    const pipeline = new Pipeline('serial-test', registry);

    const result = await pipeline
      .add('a', { task: 'Step A', input: { message: 'hello' } })
      .add('b', { task: 'Step B' })
      .add('c', { task: 'Step C' })
      .run();

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].stepName).toBe('Step A');
    expect(result.steps[0].output.output.content).toBe('agent-a: hello');
    // Step B gets Step A's output as input (passed as message)
    expect(result.steps[1].output.output.content).toBe('agent-b: agent-a: hello');
    // Step C gets Step B's output as input
    expect(result.steps[2].output.output.content).toBe('agent-c: agent-b: agent-a: hello');
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });

  it('handles branch with conditional routing', async () => {
    const agentIntent = new MockAgent('intent', async (task) => ({
      success: true,
      output: {
        content: 'User wants refund',
        structured: { intent: 'refund' },
      },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentRefund = new MockAgent('refund', async (task) => ({
      success: true,
      output: { content: `Processing refund: ${task.input.message ?? 'no-msg'}` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentDefault = new MockAgent('default-handler', async (task) => ({
      success: true,
      output: { content: 'Default handling' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));

    await initAgents({ intent: agentIntent, refund: agentRefund, default: agentDefault });

    const registry = makeRegistry({ intent: agentIntent, refund: agentRefund, default: agentDefault });
    const pipeline = new Pipeline('branch-test', registry);

    const result = await pipeline
      .add('intent', { task: 'classify', input: { message: 'I want a refund' } })
      .branch((prevOutput) => {
        if (prevOutput.output.structured?.intent === 'refund') {
          return { task: 'process-refund', agent: 'refund' } as unknown as import('@agentforge/types').StepOptions;
        }
        return null;
      })
      .run();

    expect(result.success).toBe(true);
    // Should have the intent step + the branch step
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('handles parallel steps', async () => {
    const agentA = new MockAgent('a');
    const agentB = new MockAgent('b');
    const agentMerge = new MockAgent('merge');

    await initAgents({ a: agentA, b: agentB, merge: agentMerge });

    const registry = makeRegistry({ a: agentA, b: agentB, merge: agentMerge });
    const pipeline = new Pipeline('parallel-test', registry);

    const result = await pipeline
      .parallel([
        { agent: 'a', task: 'Task A', input: { message: 'para-a' } },
        { agent: 'b', task: 'Task B', input: { message: 'para-b' } },
      ])
      .add('merge', { task: 'Merge results' })
      .run();

    expect(result.success).toBe(true);
    // 2 parallel steps + 1 merge step = 3 total
    expect(result.steps).toHaveLength(3);
  });

  it('handles backtrack control signal', async () => {
    let callCount = 0;

    const agentDraft = new MockAgent('draft', async (task) => ({
      success: true,
      output: {
        content: `Draft v${callCount > 0 ? 2 : 1}`,
        structured: { version: callCount > 0 ? 2 : 1 },
      },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));

    const agentReview = new MockAgent('review', async (task) => {
      callCount++;
      // First review: reject and send back; second review: approve
      if (callCount === 1) {
        return {
          success: true,
          output: {
            content: 'Rejected',
            structured: {
              __control: {
                action: 'back',
                targetStep: 'Draft',
                message: 'Please improve the draft',
                reason: 'Quality too low',
              },
            },
          },
          meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
        };
      }
      return {
        success: true,
        output: { content: 'Approved' },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      };
    });

    await initAgents({ draft: agentDraft, review: agentReview });

    const registry = makeRegistry({ draft: agentDraft, review: agentReview });
    const pipeline = new Pipeline('backtrack-test', registry);

    const result = await pipeline
      .add('draft', { task: 'Draft' })
      .add('review', { task: 'Review' })
      .config({ maxBacktracks: 3 })
      .run();

    expect(result.success).toBe(true);
    expect(result.backtrackHistory.length).toBe(1);
    expect(result.backtrackHistory[0].fromStep).toBe('Review');
    expect(result.backtrackHistory[0].toStep).toBe('Draft');
    expect(result.backtrackHistory[0].reason).toBe('Quality too low');
  });

  it('throws when max backtracks is exceeded', async () => {
    const agentForever = new MockAgent('forever', async () => ({
      success: true,
      output: {
        content: 'Always back',
        structured: {
          __control: {
            action: 'back',
            targetStep: 'Always back',
            reason: 'loop',
          },
        },
      },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));

    await initAgents({ forever: agentForever });

    const registry = makeRegistry({ forever: agentForever });
    const pipeline = new Pipeline('backtrack-limit', registry);

    await expect(
      pipeline
        .add('forever', { task: 'Always back' })
        .config({ maxBacktracks: 2 })
        .run(),
    ).rejects.toThrow('exceeded max backtracks');
  });

  it('handles stop control signal via interceptor', async () => {
    const agentA = new MockAgent('a', async (task) => ({
      success: true,
      output: { content: 'Result A' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentB = new MockAgent('b', async (task) => ({
      success: true,
      output: { content: 'Result B' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));

    await initAgents({ a: agentA, b: agentB });

    const registry = makeRegistry({ a: agentA, b: agentB });
    const pipeline = new Pipeline('stop-test', registry);

    const result = await pipeline
      .add('a', { task: 'Step A' })
      .add('b', { task: 'Step B' })
      .intercept('Step A', () => ({ action: 'stop' as const }))
      .run();

    // Pipeline should stop after step A
    expect(result.steps).toHaveLength(1);
    expect(result.finalOutput.output.content).toBe('Result A');
  });

  it('handles jump control signal via interceptor', async () => {
    let jumpCount = 0;

    const agentA = new MockAgent('a', async () => ({
      success: true,
      output: { content: 'A' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentB = new MockAgent('b', async () => ({
      success: true,
      output: { content: 'B' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentC = new MockAgent('c', async () => ({
      success: true,
      output: { content: 'C' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));

    await initAgents({ a: agentA, b: agentB, c: agentC });

    const registry = makeRegistry({ a: agentA, b: agentB, c: agentC });
    const pipeline = new Pipeline('jump-test', registry);

    const result = await pipeline
      .add('a', { task: 'A' })
      .add('b', { task: 'B' })
      .intercept('B', () => {
        jumpCount++;
        // Only jump once, then continue normally
        if (jumpCount === 1) {
          return { action: 'jump' as const, targetStep: 'A' };
        }
        return { action: 'continue' as const };
      })
      .add('c', { task: 'C' })
      .config({ maxBacktracks: 10 })
      .run();

    // Should have: A, B (jump), A (re-run), B (continue), C
    expect(result.steps.length).toBeGreaterThanOrEqual(4);
    expect(result.success).toBe(true);
  });

  it('handles fork control signal', async () => {
    const agentMain = new MockAgent('main', async () => ({
      success: true,
      output: { content: 'Main done', structured: {} },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentForkA = new MockAgent('fork-a', async () => ({
      success: true,
      output: { content: 'Fork A result' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentForkB = new MockAgent('fork-b', async () => ({
      success: true,
      output: { content: 'Fork B result' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentDecider = new MockAgent('decider', async (task) => ({
      success: true,
      output: { content: `Decision based on: ${task.input.message}` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));

    await initAgents({ main: agentMain, 'fork-a': agentForkA, 'fork-b': agentForkB, decider: agentDecider });

    const registry = makeRegistry({ main: agentMain, 'fork-a': agentForkA, 'fork-b': agentForkB, decider: agentDecider });
    const pipeline = new Pipeline('fork-test', registry);

    const result = await pipeline
      .add('main', { task: 'Analyze' })
      .fork('Analyze', [
        { name: 'fork-a', agent: 'fork-a', task: 'Branch A' },
        { name: 'fork-b', agent: 'fork-b', task: 'Branch B' },
      ])
      .add('decider', { task: 'Decide' })
      .intercept('Analyze', () => ({ action: 'fork' as const }))
      .run();

    expect(result.success).toBe(true);
    // Should have main step + fork step (merged) + decider step
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('throws if agent is not found in registry', async () => {
    const registry = new AgentRegistry();
    const pipeline = new Pipeline('missing-agent', registry);

    await expect(
      pipeline.add('nonexistent', { task: 'Do something' }).run(),
    ).rejects.toThrow('agent "nonexistent" not found');
  });

  it('applies step-level transform', async () => {
    const agentA = new MockAgent('a', async (task) => ({
      success: true,
      output: { content: 'raw output', structured: { value: 42 } },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
    const agentB = new MockAgent('b', async (task) => ({
      success: true,
      output: { content: `Got: ${task.input.message}` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));

    await initAgents({ a: agentA, b: agentB });

    const registry = makeRegistry({ a: agentA, b: agentB });
    const pipeline = new Pipeline('transform-test', registry);

    const result = await pipeline
      .add('a', { task: 'Step A', input: { message: 'start' } })
      .add('b', {
        task: 'Step B',
        transform: (prevOutput) => prevOutput.output.structured?.value,
      })
      .run();

    expect(result.success).toBe(true);
    expect(result.steps[1].output.output.content).toBe('Got: 42');
  });

  it('records snapshots for each step', async () => {
    const agentA = new MockAgent('a');
    await initAgents({ a: agentA });

    const registry = makeRegistry({ a: agentA });
    const pipeline = new Pipeline('snapshot-test', registry);

    const result = await pipeline
      .add('a', { task: 'Step A', input: { message: 'test' } })
      .run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].stepName).toBe('Step A');
    expect(result.steps[0].stepIndex).toBe(0);
    expect(result.steps[0].timestamp).toBeGreaterThan(0);
    expect(result.steps[0].output).toBeDefined();
  });
});

// =====================================================================
// AgentFramework tests
// =====================================================================

// Named agent classes for framework registration (must have zero-arg constructors)
class TestAgentA extends BaseAgent<AgentConfig> {
  constructor() {
    super({ name: 'test-agent', role: 'mock' });
  }
  protected async doInit(): Promise<void> {}
  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return {
      success: true,
      output: { content: `test-agent: ${task.input.message ?? 'no-input'}` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    };
  }
}

class RunnerAgent extends BaseAgent<AgentConfig> {
  constructor() {
    super({ name: 'runner', role: 'mock' });
  }
  protected async doInit(): Promise<void> {}
  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return {
      success: true,
      output: { content: `runner: ${task.input.message ?? 'no-input'}` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    };
  }
}

class SimpleAgent extends BaseAgent<AgentConfig> {
  constructor() {
    super({ name: 'simple', role: 'mock' });
  }
  protected async doInit(): Promise<void> {}
  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return {
      success: true,
      output: { content: `simple: ${task.input.message ?? 'no-input'}` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    };
  }
}

describe('AgentFramework', () => {
  it('registers and initializes agents', async () => {
    const framework = new AgentFramework();
    framework.register('test-agent', TestAgentA);
    await framework.init();

    const agent = framework.get('test-agent');
    expect(agent).toBeDefined();
    expect(agent.name).toBe('test-agent');

    await framework.destroy();
  });

  it('runs an agent by name', async () => {
    const framework = new AgentFramework();
    framework.register('runner', RunnerAgent);
    await framework.init();

    const result = await framework.run('runner', {
      type: 'chat',
      input: { message: 'hello' },
    });

    expect(result.success).toBe(true);
    expect(result.output.content).toBe('runner: hello');

    await framework.destroy();
  });

  it('creates a pipeline', async () => {
    const framework = new AgentFramework();
    framework.register('a', SimpleAgent);
    await framework.init();

    const pipeline = framework.pipeline('test-pipeline');
    expect(pipeline).toBeDefined();

    await framework.destroy();
  });

  it('delegates event bus methods', async () => {
    const framework = new AgentFramework();
    const handler = vi.fn();

    framework.on('test-event', handler);
    framework.emit('test-event', 'data');
    expect(handler).toHaveBeenCalledWith('data');

    framework.off('test-event', handler);
    framework.emit('test-event', 'data2');
    expect(handler).toHaveBeenCalledOnce(); // not called again

    await framework.destroy();
  });

  it('once() handler fires only once', async () => {
    const framework = new AgentFramework();
    const handler = vi.fn();

    framework.once('once-event', handler);
    framework.emit('once-event');
    framework.emit('once-event');
    expect(handler).toHaveBeenCalledOnce();

    await framework.destroy();
  });

  it('throws when getting unregistered agent', () => {
    const framework = new AgentFramework();
    expect(() => framework.get('nonexistent')).toThrow('not found');
  });

  it('destroy clears all agents and events', async () => {
    const framework = new AgentFramework();
    framework.register('a', SimpleAgent);
    await framework.init();

    const handler = vi.fn();
    framework.on('ev', handler);

    await framework.destroy();

    // After destroy, getting the agent should throw
    expect(() => framework.get('a')).toThrow('not found');
  });

  it('resolves model from ModelRegistry', async () => {
    const framework = new AgentFramework({
      modelRegistry: {
        endpoints: [
          {
            id: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            provider: 'openai',
            apiKey: 'test-key',
            models: ['gpt-4o', 'gpt-4o-mini'],
          },
        ],
        defaultEndpoint: 'openai',
        defaultModel: 'gpt-4o',
      },
    });

    framework.register('test', SimpleAgent);
    await framework.init();

    const agent = framework.get('test');
    expect(agent).toBeDefined();

    await framework.destroy();
  });
});
