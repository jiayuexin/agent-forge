import { describe, expect, it, vi } from 'vitest';
import type { AgentResult, AgentTask, RemoteAgentCapability } from '@agentforge/types';
import { CapabilityRegistry } from '../../src/CapabilityRegistry.js';
import {
  RemoteAgentCapabilityExecutor,
  type CapabilityExecutionContext,
} from '../../src/capability-executors/index.js';

const capability: RemoteAgentCapability = {
  id: 'remote:test',
  type: 'remote-agent',
  name: 'remote-test',
  description: 'Runs remotely',
  nodeId: 'node-1',
};
const task: AgentTask = { type: 'test', input: { value: 1 } };
const expected: AgentResult = {
  success: true,
  output: { content: 'remote result' },
  meta: {
    duration: 0,
    tokensUsed: { input: 0, output: 0, total: 0 },
    model: 'remote',
  },
};

function createContext(): CapabilityExecutionContext {
  return {
    callStack: Object.freeze([capability.id]),
    maxDepth: 8,
    capabilities: new CapabilityRegistry(),
    executeCapability: vi.fn(),
    canExecuteCapability: vi.fn(() => true),
  };
}

describe('RemoteAgentCapabilityExecutor', () => {
  it('executes through ClientAgentProxy and the configured invoker', async () => {
    const invoker = { execute: vi.fn(async () => expected) };
    const executor = new RemoteAgentCapabilityExecutor(() => invoker);

    await expect(executor.execute(capability, task, createContext())).resolves.toBe(expected);
    expect(invoker.execute).toHaveBeenCalledWith(capability.nodeId, task);
  });

  it('fails explicitly when no remote invoker is configured', async () => {
    const executor = new RemoteAgentCapabilityExecutor(() => undefined);

    await expect(executor.execute(capability, task, createContext())).rejects.toMatchObject({
      code: 'REMOTE_AGENT_NOT_CONNECTED',
    });
  });

  it('reports executability from the current remote invoker', () => {
    const getInvoker = vi.fn<
      () =>
        | {
            execute(nodeId: string, task: AgentTask): Promise<AgentResult>;
          }
        | undefined
    >(() => undefined);
    const executor = new RemoteAgentCapabilityExecutor(getInvoker);
    const context = createContext();

    expect(executor.canExecute?.(capability, context)).toBe(false);
    getInvoker.mockReturnValue({ execute: vi.fn(async () => expected) });
    expect(executor.canExecute?.(capability, context)).toBe(true);
  });
});
