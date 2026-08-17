import { describe, expect, it, vi } from 'vitest';
import type { AgentResult, AgentTask, Capability, CapabilityType } from '@agentforge/types';
import {
  CapabilityExecutorRegistry,
  type CapabilityExecutionContext,
  type CapabilityExecutor,
} from '../../src/capability-executors/index.js';

const task: AgentTask = { type: 'test', input: {} };

function successResult(content: string): AgentResult {
  return {
    success: true,
    output: { content },
    meta: {
      duration: 0,
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'test',
    },
  };
}

function capability(type: CapabilityType): Capability {
  const common = {
    id: `${type}:test`,
    type,
    name: `${type}-test`,
    description: `Executes ${type}`,
  };

  switch (type) {
    case 'agent':
      return common;
    case 'remote-agent':
      return { ...common, type, nodeId: 'node-1' };
    case 'tool':
      return {
        ...common,
        type,
        endpointType: 'local-function',
        endpoint: { target: 'test' },
        inputSchema: { type: 'object' },
      };
    case 'skill':
      return { ...common, type, tools: [], promptTemplate: 'Run the skill.' };
    case 'plugin':
      return {
        ...common,
        type,
        downloadUrl: 'https://example.com/plugin.wasm',
        signature: 'signature',
        keyId: 'key-1',
        entry: 'plugin.wasm',
        allowedCapabilities: [],
        sandbox: { timeoutMs: 1_000, maxMemoryPages: 1 },
      };
  }
}

describe('CapabilityExecutorRegistry', () => {
  it('dispatches all five capability types to their registered executor', async () => {
    const registry = new CapabilityExecutorRegistry();
    const context = {} as CapabilityExecutionContext;

    for (const type of [
      'agent',
      'remote-agent',
      'tool',
      'skill',
      'plugin',
    ] satisfies CapabilityType[]) {
      const execute = vi.fn(async () => successResult(type));
      registry.register({ type, execute } as CapabilityExecutor);

      await expect(registry.execute(capability(type), task, context)).resolves.toMatchObject({
        output: { content: type },
      });
      expect(execute).toHaveBeenCalledWith(capability(type), task, context);
    }
  });

  it('rejects a second executor for the same capability type', () => {
    const registry = new CapabilityExecutorRegistry();
    const executor = {
      type: 'agent',
      execute: vi.fn(async () => successResult('agent')),
    } satisfies CapabilityExecutor<'agent'>;

    registry.register(executor);

    expect(() => registry.register(executor)).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_CAPABILITY_EXECUTOR' })
    );
  });

  it('fails explicitly when no executor is registered for a capability type', async () => {
    const registry = new CapabilityExecutorRegistry();

    await expect(
      registry.execute(capability('agent'), task, {} as CapabilityExecutionContext)
    ).rejects.toMatchObject({ code: 'CAPABILITY_EXECUTOR_NOT_FOUND' });
  });
});
