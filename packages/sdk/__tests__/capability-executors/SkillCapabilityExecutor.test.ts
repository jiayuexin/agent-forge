import { describe, expect, it, vi } from 'vitest';
import { AgentStatus } from '@agentforge/types';
import type {
  AgentCapabilityDefinition,
  AgentResult,
  AgentStreamChunk,
  AgentTask,
  IStatelessAgent,
  Logger,
  ModelConfig,
  SkillCapability,
  ToolCapability,
  ToolContext,
} from '@agentforge/types';
import { CapabilityRegistry } from '../../src/CapabilityRegistry.js';
import {
  SkillCapabilityExecutor,
  type CapabilityExecutionContext,
  type SkillAgentFactoryOptions,
  type ToolEndpointAdapters,
} from '../../src/capability-executors/index.js';

const allowedTool: ToolCapability = {
  id: 'tool:allowed',
  type: 'tool',
  name: 'allowed-tool',
  description: 'Allowed tool',
  endpointType: 'local-function',
  endpoint: { target: 'tools.allowed' },
  inputSchema: { type: 'object' },
};
const extraTool: ToolCapability = {
  ...allowedTool,
  id: 'tool:extra',
  name: 'extra-tool',
  endpoint: { target: 'tools.extra' },
};
const skill: SkillCapability = {
  id: 'skill:test',
  type: 'skill',
  name: 'test-skill',
  description: 'Runs only its allowed tools',
  tools: [allowedTool.id],
  promptTemplate: 'Use only the supplied tools.',
};
const task: AgentTask = { type: 'skill', input: { value: 1 } };
const model: ModelConfig = {
  provider: 'test',
  modelName: 'default-model',
};

function result(content: string, structured?: Record<string, unknown>): AgentResult {
  return {
    success: true,
    output: { content, structured },
    meta: {
      duration: 0,
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'test',
    },
  };
}

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

function createAgent(execute: (task: AgentTask) => Promise<AgentResult>): IStatelessAgent {
  return {
    id: 'temporary-skill-agent',
    name: 'temporary-skill-agent',
    role: 'skill',
    version: '1.0.0',
    capabilities: [],
    status: AgentStatus.READY,
    isStateless: true,
    init: vi.fn(async () => {}),
    execute: vi.fn(execute),
    stream: async function* (): AsyncIterable<AgentStreamChunk> {},
    destroy: vi.fn(async () => {}),
    on() {
      return this;
    },
    off() {
      return this;
    },
  };
}

function createContext(
  registry: CapabilityRegistry,
  executeCapability = vi.fn(async () => result('tool result', { result: { ok: true } }))
): CapabilityExecutionContext {
  return {
    callStack: Object.freeze([skill.id]),
    maxDepth: 8,
    capabilities: registry,
    executeCapability,
    canExecuteCapability: vi.fn(() => true),
  };
}

describe('SkillCapabilityExecutor', () => {
  it('creates and destroys a real-boundary temporary agent with only whitelisted tools', async () => {
    const registry = new CapabilityRegistry();
    registry.register(allowedTool);
    registry.register(extraTool);
    const adapters: ToolEndpointAdapters = {
      'local-function': vi.fn(),
    };
    let factoryOptions: SkillAgentFactoryOptions | undefined;
    const temporaryAgent = createAgent(async () => {
      const tool = factoryOptions!.config.tools![0];
      const output = await tool.handler!({ value: 1 }, {} as ToolContext);
      return result(JSON.stringify(output));
    });
    const factory = vi.fn(async (options: SkillAgentFactoryOptions) => {
      factoryOptions = options;
      return temporaryAgent;
    });
    const context = createContext(registry);
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => adapters,
      logger: createLogger(),
      agentFactory: factory,
    });

    await expect(executor.execute(skill, task, context)).resolves.toMatchObject({
      success: true,
      output: { content: JSON.stringify({ ok: true }) },
    });

    expect(factoryOptions?.config).toMatchObject({
      model,
      systemPrompt: skill.promptTemplate,
      availableCapabilities: [{ id: allowedTool.id }],
      tools: [{ name: allowedTool.name }],
    });
    expect(factoryOptions?.config.tools).toHaveLength(1);
    expect(factoryOptions?.runtimeOptions.toolAdapters).toBe(adapters);
    expect(context.executeCapability).toHaveBeenCalledWith(allowedTool.id, {
      type: 'skill-tool',
      input: { value: 1 },
      context: task.context,
      meta: task.meta,
    });
    expect(temporaryAgent.init).toHaveBeenCalledOnce();
    expect(temporaryAgent.execute).toHaveBeenCalledWith(task);
    expect(temporaryAgent.destroy).toHaveBeenCalledOnce();
  });

  it('preserves a null result returned by a whitelisted tool', async () => {
    const registry = new CapabilityRegistry();
    registry.register(allowedTool);
    let factoryOptions: SkillAgentFactoryOptions | undefined;
    const temporaryAgent = createAgent(async () => {
      const tool = factoryOptions!.config.tools![0];
      const output = await tool.handler!({}, {} as ToolContext);
      expect(output).toBeNull();
      return result('null');
    });
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => ({ 'local-function': vi.fn() }),
      logger: createLogger(),
      agentFactory: async (options) => {
        factoryOptions = options;
        return temporaryAgent;
      },
    });
    const context = createContext(
      registry,
      vi.fn(async () => result('null', { result: null }))
    );

    await expect(executor.execute(skill, task, context)).resolves.toMatchObject({
      success: true,
    });
  });

  it('fails explicitly when a declared tool capability is missing', async () => {
    const registry = new CapabilityRegistry();
    const factory = vi.fn();
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => ({}),
      logger: createLogger(),
      agentFactory: factory,
    });

    await expect(executor.execute(skill, task, createContext(registry))).rejects.toMatchObject({
      code: 'SKILL_TOOL_NOT_FOUND',
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects a declared dependency that is not a ToolCapability', async () => {
    const registry = new CapabilityRegistry();
    const notATool: AgentCapabilityDefinition = {
      id: allowedTool.id,
      type: 'agent',
      name: 'not-a-tool',
      description: 'Invalid skill dependency',
    };
    registry.register(notATool);
    const factory = vi.fn();
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => ({}),
      logger: createLogger(),
      agentFactory: factory,
    });

    await expect(executor.execute(skill, task, createContext(registry))).rejects.toMatchObject({
      code: 'SKILL_TOOL_INVALID_TYPE',
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects duplicate tool ids in the skill definition', async () => {
    const registry = new CapabilityRegistry();
    registry.register(allowedTool);
    const duplicateSkill = {
      ...skill,
      tools: [allowedTool.id, allowedTool.id],
    };
    const factory = vi.fn();
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => ({}),
      logger: createLogger(),
      agentFactory: factory,
    });

    await expect(
      executor.execute(duplicateSkill, task, createContext(registry))
    ).rejects.toMatchObject({ code: 'SKILL_TOOL_DUPLICATE' });
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects a declared tool that is not currently executable', async () => {
    const registry = new CapabilityRegistry();
    registry.register(allowedTool);
    const factory = vi.fn();
    const context: CapabilityExecutionContext = {
      ...createContext(registry),
      canExecuteCapability: vi.fn(() => false),
    };
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => ({}),
      logger: createLogger(),
      agentFactory: factory,
    });

    await expect(executor.execute(skill, task, context)).rejects.toMatchObject({
      code: 'SKILL_TOOL_NOT_EXECUTABLE',
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('destroys the temporary agent when initialization throws', async () => {
    const registry = new CapabilityRegistry();
    registry.register(allowedTool);
    const initializationError = new Error('skill initialization failed');
    const temporaryAgent = createAgent(async () => result('unused'));
    vi.mocked(temporaryAgent.init).mockRejectedValue(initializationError);
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => ({}),
      logger: createLogger(),
      agentFactory: async () => temporaryAgent,
    });

    await expect(executor.execute(skill, task, createContext(registry))).rejects.toBe(
      initializationError
    );
    expect(temporaryAgent.execute).not.toHaveBeenCalled();
    expect(temporaryAgent.destroy).toHaveBeenCalledOnce();
  });

  it('destroys the temporary agent when task execution throws', async () => {
    const registry = new CapabilityRegistry();
    registry.register(allowedTool);
    const executionError = new Error('skill execution failed');
    const temporaryAgent = createAgent(async () => {
      throw executionError;
    });
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => ({}),
      logger: createLogger(),
      agentFactory: async () => temporaryAgent,
    });

    await expect(executor.execute(skill, task, createContext(registry))).rejects.toBe(
      executionError
    );
    expect(temporaryAgent.destroy).toHaveBeenCalledOnce();
  });

  it('reports executability only when every whitelisted tool is executable', () => {
    const registry = new CapabilityRegistry();
    registry.register(allowedTool);
    let toolExecutable = false;
    const context: CapabilityExecutionContext = {
      ...createContext(registry),
      canExecuteCapability: vi.fn(() => toolExecutable),
    };
    const executor = new SkillCapabilityExecutor({
      resolveModel: () => model,
      getAdapters: () => ({}),
      logger: createLogger(),
      agentFactory: vi.fn(),
    });

    expect(executor.canExecute?.(skill, context)).toBe(false);
    toolExecutable = true;
    expect(executor.canExecute?.(skill, context)).toBe(true);
  });
});
