import { describe, it, expect, vi } from 'vitest';
import type {
  AgentResult,
  AgentTask,
  CapabilityRegistry,
  ExecutionPlan,
  IPlannerAgent,
  Logger,
} from '@agentforge/types';
import { PlanExecutor } from '../../src/planner/PlanExecutor.js';
import { CapabilityRegistry } from '../../src/CapabilityRegistry.js';
import { SimpleLogger } from '@agentforge/core';

function createLogger(): Logger {
  return new SimpleLogger({ component: 'test' });
}

function successResult(content: string): AgentResult {
  return {
    success: true,
    output: { content, structured: { value: content } },
    meta: { duration: 10, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
  };
}

function failedResult(message: string): AgentResult {
  return {
    success: false,
    output: { content: '' },
    meta: { duration: 10, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    error: { code: 'FAIL', message },
  };
}

describe('PlanExecutor', () => {
  it('executes a simple plan', async () => {
    const registry = new CapabilityRegistry();
    registry.register({ id: 'cap:a', type: 'agent', name: 'a', description: 'A' });

    const executeCapability = vi.fn(async (id: string) => {
      expect(id).toBe('cap:a');
      return successResult('done');
    });

    const executor = new PlanExecutor({
      executeCapability,
      registry,
      planner: {} as IPlannerAgent,
      logger: createLogger(),
    });

    const plan: ExecutionPlan = {
      goal: 'test',
      capabilitiesUsed: ['cap:a'],
      steps: [{ id: 's1', name: 'step1', capability: 'cap:a', type: 'agent', task: 'run', input: {} }],
    };

    const result = await executor.execute(plan);
    expect(result.success).toBe(true);
    expect(result.output.content).toBe('done');
  });

  it('respects dependencies and runs independent steps in parallel', async () => {
    const registry = new CapabilityRegistry();
    registry.register({ id: 'cap:a', type: 'agent', name: 'a', description: 'A' });
    registry.register({ id: 'cap:b', type: 'agent', name: 'b', description: 'B' });

    const executed: string[] = [];
    const executeCapability = vi.fn(async (id: string) => {
      executed.push(id);
      return successResult(id);
    });

    const executor = new PlanExecutor({
      executeCapability,
      registry,
      planner: {} as IPlannerAgent,
      logger: createLogger(),
    });

    const plan: ExecutionPlan = {
      goal: 'parallel test',
      capabilitiesUsed: ['cap:a', 'cap:b'],
      steps: [
        { id: 's1', name: 'a', capability: 'cap:a', type: 'agent', task: 'run', input: {} },
        { id: 's2', name: 'b', capability: 'cap:b', type: 'agent', task: 'run', input: {}, dependsOn: ['s1'] },
      ],
    };

    const result = await executor.execute(plan);
    expect(result.success).toBe(true);
    expect(executed.indexOf('cap:a')).toBeLessThan(executed.indexOf('cap:b'));
  });

  it('interpolates variables from previous steps', async () => {
    const registry = new CapabilityRegistry();
    registry.register({ id: 'cap:a', type: 'agent', name: 'a', description: 'A' });

    const executeCapability = vi.fn(async (_id: string, task: AgentTask) => {
      return successResult(String(task.input.message));
    });

    const executor = new PlanExecutor({
      executeCapability,
      registry,
      planner: {} as IPlannerAgent,
      logger: createLogger(),
    });

    const plan: ExecutionPlan = {
      goal: 'interpolate',
      capabilitiesUsed: ['cap:a'],
      steps: [
        { id: 's1', name: 'first', capability: 'cap:a', type: 'agent', task: 'run', input: {}, outputAs: 'greeting' },
        {
          id: 's2',
          name: 'second',
          capability: 'cap:a',
          type: 'agent',
          task: 'run',
          input: { message: '${greeting.output.content}' },
          dependsOn: ['s1'],
        },
      ],
    };

    executeCapability.mockImplementation(async (_id: string, task: AgentTask) => {
      if (task.input.task === 'run' && !task.input.message) return successResult('hello');
      return successResult(String(task.input.message));
    });

    const result = await executor.execute(plan);
    expect(result.success).toBe(true);
    expect(result.output.content).toBe('hello');
  });

  it('replans on step failure up to max attempts', async () => {
    const registry = new CapabilityRegistry();
    registry.register({ id: 'cap:a', type: 'agent', name: 'a', description: 'A' });

    const executeCapability = vi.fn(async () => failedResult('always fails'));

    const planner: IPlannerAgent = {
      registry,
      plan: vi.fn(),
      replan: vi.fn(async () => ({
        goal: 'retry',
        capabilitiesUsed: ['cap:a'],
        steps: [
          { id: 's1', name: 'retry', capability: 'cap:a', type: 'agent', task: 'run', input: {} },
        ],
      })),
    };

    const executor = new PlanExecutor({
      executeCapability,
      registry,
      planner,
      logger: createLogger(),
    });

    const plan: ExecutionPlan = {
      goal: 'test',
      capabilitiesUsed: ['cap:a'],
      steps: [{ id: 's1', name: 'step1', capability: 'cap:a', type: 'agent', task: 'run', input: {} }],
    };

    const result = await executor.execute(plan, { maxReplanAttempts: 2 });
    expect(result.success).toBe(false);
    expect(planner.replan).toHaveBeenCalledTimes(2);
  });

  it('requires approval when plan has high risk capability', async () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: 'cap:risk',
      type: 'agent',
      name: 'risky',
      description: 'Risky',
      riskLevel: 'high',
    });

    const executor = new PlanExecutor({
      executeCapability: vi.fn(),
      registry,
      planner: {} as IPlannerAgent,
      logger: createLogger(),
    });

    const plan: ExecutionPlan = {
      goal: 'risky',
      capabilitiesUsed: ['cap:risk'],
      steps: [{ id: 's1', name: 'risky', capability: 'cap:risk', type: 'agent', task: 'run', input: {} }],
    };

    await expect(executor.execute(plan)).rejects.toThrow(/approval/i);
  });

  it('calls approval handler and accepts modified plan', async () => {
    const registry = new CapabilityRegistry();
    registry.register({ id: 'cap:a', type: 'agent', name: 'a', description: 'A' });

    const approvalHandler = vi.fn(async () => ({ approved: true }));
    const executeCapability = vi.fn(async () => successResult('ok'));

    const executor = new PlanExecutor({
      executeCapability,
      registry,
      planner: {} as IPlannerAgent,
      logger: createLogger(),
    });

    const plan: ExecutionPlan = {
      goal: 'test',
      capabilitiesUsed: ['cap:a'],
      steps: [{ id: 's1', name: 'step1', capability: 'cap:a', type: 'agent', task: 'run', input: {} }],
      constraints: { requireApproval: true },
    };

    const result = await executor.execute(plan, { approvalHandler });
    expect(approvalHandler).toHaveBeenCalledWith(plan);
    expect(result.success).toBe(true);
  });

  it('fails fast on timeout', async () => {
    const registry = new CapabilityRegistry();
    registry.register({ id: 'cap:slow', type: 'agent', name: 'slow', description: 'Slow' });

    const executeCapability = vi.fn(
      () => new Promise<AgentResult>((resolve) => setTimeout(() => resolve(successResult('late')), 100))
    );

    const executor = new PlanExecutor({
      executeCapability,
      registry,
      planner: {} as IPlannerAgent,
      logger: createLogger(),
    });

    const plan: ExecutionPlan = {
      goal: 'test',
      capabilitiesUsed: ['cap:slow'],
      steps: [{ id: 's1', name: 'step1', capability: 'cap:slow', type: 'agent', task: 'run', input: {} }],
    };

    const result = await executor.execute(plan, { stepTimeout: 10, maxReplanAttempts: 0 });
    expect(result.success).toBe(false);
    expect(result.stepResults[0].error?.code).toBe('STEP_TIMEOUT');
  });
});
