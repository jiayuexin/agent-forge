import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProviderFactory } from '@agentforge/core';
import type { IProvider, ModelConfig, ChatParams, ChatResponse, CapabilityRegistry } from '@agentforge/types';
import { PlannerAgent } from '../../src/planner/PlannerAgent.js';
import { CapabilityRegistry } from '../../src/CapabilityRegistry.js';

const planJson = JSON.stringify({
  goal: 'Greet the user',
  capabilitiesUsed: ['agent:greet'],
  steps: [
    {
      id: 'step-1',
      name: 'greet',
      capability: 'agent:greet',
      type: 'agent',
      task: 'Say hello',
      input: {},
    },
  ],
});

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

describe('PlannerAgent', () => {
  beforeAll(() => {
    ProviderFactory.register('static', StaticProvider);
  });

  afterAll(() => {
    // ProviderFactory has no unregister; static provider is harmless in tests.
  });

  function createPlanner(registry: CapabilityRegistry, response: string) {
    const config = {
      identity: { name: 'planner', role: 'planner', version: '1.0.0' },
      model: { provider: 'static', modelName: 'static', extra: { response } } as ModelConfig,
      systemPrompt: 'You are a planner.',
      availableCapabilities: [],
      allowPlanning: true,
    };
    return new PlannerAgent(config, registry);
  }

  it('generates an execution plan', async () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: 'agent:greet',
      type: 'agent',
      name: 'greet',
      description: 'Greets users',
    });

    const planner = createPlanner(registry, planJson);
    await planner.init();

    const plan = await planner.plan({ type: 'chat', input: { message: 'hello' } });
    expect(plan.goal).toBe('Greet the user');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].capability).toBe('agent:greet');
  });

  it('throws when the planner response is not valid JSON', async () => {
    const registry = new CapabilityRegistry();
    const planner = createPlanner(registry, 'not-json');
    await planner.init();

    await expect(planner.plan({ type: 'chat', input: { message: 'hello' } })).rejects.toThrow();
  });

  it('replan uses failed step context', async () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: 'agent:greet',
      type: 'agent',
      name: 'greet',
      description: 'Greets users',
    });

    const planner = createPlanner(registry, planJson);
    await planner.init();

    const context = {
      task: { type: 'chat', input: { message: 'hello' } },
      plan: JSON.parse(planJson) as ReturnType<typeof JSON.parse>,
      failedStep: {
        stepId: 'step-1',
        success: false,
        output: null,
        duration: 0,
        error: { code: 'FAIL', message: 'Greeting failed' },
      },
      completedSteps: [],
      remainingSteps: [],
      userInput: {},
      attemptNumber: 1,
    };

    const newPlan = await planner.replan(context.failedStep, context);
    expect(newPlan.steps).toHaveLength(1);
  });
});
