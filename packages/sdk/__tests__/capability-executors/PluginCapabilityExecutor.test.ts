import { describe, expect, it, vi } from 'vitest';
import type { AgentResult, AgentTask, PluginCapability } from '@agentforge/types';
import { CapabilityRegistry } from '../../src/CapabilityRegistry.js';
import {
  PluginCapabilityExecutor,
  type CapabilityExecutionContext,
} from '../../src/capability-executors/index.js';

const capability: PluginCapability = {
  id: 'plugin:test',
  type: 'plugin',
  name: 'test-plugin',
  description: 'Runs a test plugin',
  downloadUrl: 'https://example.com/plugin.wasm',
  signature: 'signature',
  keyId: 'key-1',
  entry: 'plugin.wasm',
  allowedCapabilities: [],
  sandbox: { timeoutMs: 1_000, maxMemoryPages: 1 },
};
const task: AgentTask = { type: 'plugin', input: { value: 1 } };
const expected: AgentResult = {
  success: true,
  output: { content: 'plugin result' },
  meta: {
    duration: 0,
    tokensUsed: { input: 0, output: 0, total: 0 },
    model: 'plugin',
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

describe('PluginCapabilityExecutor', () => {
  it('returns the real AgentResult from the injected plugin runtime boundary', async () => {
    const invoker = { execute: vi.fn(async () => expected) };
    const context = createContext();
    const executor = new PluginCapabilityExecutor(() => invoker);

    await expect(executor.execute(capability, task, context)).resolves.toBe(expected);
    expect(invoker.execute).toHaveBeenCalledWith(capability, task, context);
  });

  it('fails with PLUGIN_RUNTIME_NOT_CONFIGURED instead of returning a placeholder result', async () => {
    const executor = new PluginCapabilityExecutor(() => undefined);

    await expect(executor.execute(capability, task, createContext())).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_NOT_CONFIGURED',
    });
  });
});
