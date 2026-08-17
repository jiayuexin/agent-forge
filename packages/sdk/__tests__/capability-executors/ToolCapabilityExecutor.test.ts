import { describe, expect, it, vi } from 'vitest';
import type { AgentTask, Logger, ToolCapability } from '@agentforge/types';
import { CapabilityRegistry } from '../../src/CapabilityRegistry.js';
import {
  ToolCapabilityExecutor,
  type CapabilityExecutionContext,
  type ToolEndpointAdapters,
} from '../../src/capability-executors/index.js';

const capability: ToolCapability = {
  id: 'tool:add',
  type: 'tool',
  name: 'add',
  description: 'Adds two numbers',
  endpointType: 'local-function',
  endpoint: { target: 'math.add', method: 'call' },
  inputSchema: {
    type: 'object',
    properties: {
      left: { type: 'number' },
      right: { type: 'number' },
    },
  },
};
const task: AgentTask = { type: 'tool', input: { left: 2, right: 3 } };

function createLogger(): Logger {
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return logger;
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

describe('ToolCapabilityExecutor', () => {
  it('maps ToolCapability to ToolDefinition and executes task.input through ToolRunner', async () => {
    const localFunction = vi.fn(async (_tool, args) => ({
      total: Number(args.left) + Number(args.right),
    }));
    const adapters: ToolEndpointAdapters = { 'local-function': localFunction };
    const executor = new ToolCapabilityExecutor({
      getAdapters: () => adapters,
      logger: createLogger(),
    });

    const result = await executor.execute(capability, task, createContext());

    expect(localFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: capability.name,
        description: capability.description,
        parameters: capability.inputSchema,
        endpointType: capability.endpointType,
        endpoint: capability.endpoint,
      }),
      task.input,
      expect.objectContaining({
        agent: expect.objectContaining({ name: 'capability-tool-host' }),
      })
    );
    expect(result).toMatchObject({
      success: true,
      output: {
        structured: { result: { total: 5 } },
      },
      meta: {
        model: 'tool',
        toolsCalled: [
          {
            name: capability.name,
            args: task.input,
            result: { total: 5 },
            status: 'success',
          },
        ],
      },
    });
  });

  it('reports executability only when its endpoint adapter is configured', () => {
    let adapters: ToolEndpointAdapters = {};
    const executor = new ToolCapabilityExecutor({
      getAdapters: () => adapters,
      logger: createLogger(),
    });
    const context = createContext();

    expect(executor.canExecute?.(capability, context)).toBe(false);
    adapters = { 'local-function': vi.fn() };
    expect(executor.canExecute?.(capability, context)).toBe(true);
  });
});
