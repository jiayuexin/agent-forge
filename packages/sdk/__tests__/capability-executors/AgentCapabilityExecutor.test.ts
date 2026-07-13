import { describe, expect, it, vi } from 'vitest';
import { AgentStatus } from '@agentforge/types';
import type { AgentCapabilityDefinition, AgentResult, AgentTask, IAgent } from '@agentforge/types';
import { CapabilityRegistry } from '../../src/CapabilityRegistry.js';
import {
  AgentCapabilityExecutor,
  type CapabilityExecutionContext,
} from '../../src/capability-executors/index.js';

const capability: AgentCapabilityDefinition = {
  id: 'agent:test',
  type: 'agent',
  name: 'test',
  description: 'Runs the test agent',
};
const task: AgentTask = { type: 'test', input: { value: 1 } };
const expected: AgentResult = {
  success: true,
  output: { content: 'agent result' },
  meta: {
    duration: 0,
    tokensUsed: { input: 0, output: 0, total: 0 },
    model: 'test',
  },
};

function createAgent(): IAgent {
  return {
    id: 'agent-1',
    name: 'test',
    role: 'test',
    version: '1.0.0',
    capabilities: [],
    status: AgentStatus.READY,
    init: vi.fn(),
    execute: vi.fn(async () => expected),
    stream: vi.fn(),
    destroy: vi.fn(),
    on() {
      return this;
    },
    off() {
      return this;
    },
  };
}

function createContext(): CapabilityExecutionContext {
  return {
    callStack: Object.freeze([capability.id]),
    maxDepth: 8,
    capabilities: new CapabilityRegistry(),
    executeCapability: vi.fn(),
    canExecuteCapability: vi.fn(() => true),
  };
}

describe('AgentCapabilityExecutor', () => {
  it('executes the agent bound to the capability id', async () => {
    const agent = createAgent();
    const executor = new AgentCapabilityExecutor((id) =>
      id === capability.id ? agent : undefined
    );

    await expect(executor.execute(capability, task, createContext())).resolves.toBe(expected);
    expect(agent.execute).toHaveBeenCalledWith(task);
  });

  it('fails explicitly when the capability has no bound agent', async () => {
    const executor = new AgentCapabilityExecutor(() => undefined);

    await expect(executor.execute(capability, task, createContext())).rejects.toMatchObject({
      code: 'CAPABILITY_AGENT_NOT_FOUND',
    });
  });

  it('reports executability from the current capability-to-agent binding', () => {
    const resolveAgent = vi.fn<() => IAgent | undefined>(() => undefined);
    const executor = new AgentCapabilityExecutor(resolveAgent);
    const context = createContext();

    expect(executor.canExecute?.(capability, context)).toBe(false);
    resolveAgent.mockReturnValue(createAgent());
    expect(executor.canExecute?.(capability, context)).toBe(true);
  });
});
