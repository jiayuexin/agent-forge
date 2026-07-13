import { describe, expect, it, vi } from 'vitest';
import { AgentStatus } from '@agentforge/types';
import type {
  AgentResult,
  AgentStreamChunk,
  AgentTask,
  Capability,
  IClientAgent,
  Logger,
  PluginCapability,
  ToolCapability,
} from '@agentforge/types';
import type { ToolAdapterMap, WasiPluginExecutionContext } from '@agentforge/core';
import {
  CachedCapabilitySource,
  type CachedCapabilityStore,
  type CachedPluginRunner,
} from '../src/CachedCapabilitySource.js';

const addTool: ToolCapability = {
  id: 'tool:add',
  type: 'tool',
  name: 'add',
  description: 'Add values',
  endpointType: 'local-function',
  endpoint: { target: 'math.add' },
  inputSchema: { type: 'object' },
};
const unavailableTool: ToolCapability = {
  ...addTool,
  id: 'tool:missing-adapter',
  name: 'missing-adapter',
  endpointType: 'remote-agent',
};
const skill: Capability = {
  id: 'skill:math',
  type: 'skill',
  name: 'math-skill',
  description: 'Use math tools',
  tools: [addTool.id],
  promptTemplate: 'Use the supplied math tools.',
  inputSchema: { type: 'object' },
};
const plugin: PluginCapability = {
  id: 'plugin:math',
  type: 'plugin',
  name: 'math-plugin',
  description: 'Run math plugin',
  downloadUrl: 'https://example.com/math.wasm',
  signature: 'signature',
  keyId: 'publisher',
  entry: 'run',
  allowedCapabilities: [addTool.id],
  sandbox: { timeoutMs: 1_000, maxMemoryPages: 8 },
  inputSchema: { type: 'object' },
};

describe('CachedCapabilitySource', () => {
  it('exposes cached Tool, executable Skill, and Plugin as dynamic Agent tools', () => {
    const source = createSource({
      capabilities: [addTool, unavailableTool, skill, plugin],
    }).source;

    expect(source.listCapabilities()).toEqual([addTool, unavailableTool, skill, plugin]);
    expect(source.listTools().map((tool) => tool.name)).toEqual([
      addTool.name,
      skill.name,
      plugin.name,
    ]);
  });

  it('executes a cached Tool through its explicit endpoint adapter', async () => {
    const localFunction = vi.fn(async (_tool, args) => ({
      total: Number(args.left) + Number(args.right),
    }));
    const { source } = createSource({
      capabilities: [addTool],
      adapters: { 'local-function': localFunction },
    });

    const result = await source.executeCapability(addTool.id, {
      type: 'tool',
      input: { left: 2, right: 3 },
    });

    expect(localFunction).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      success: true,
      output: { structured: { result: { total: 5 } } },
    });
  });

  it('executes a Skill in a scoped Agent with only its declared cached tools', async () => {
    const { source, agent } = createSource({
      capabilities: [addTool, unavailableTool, skill],
    });
    vi.mocked(agent.executeScopedTask).mockResolvedValue(success('skill-result'));

    await expect(
      source.executeCapability(skill.id, { type: 'skill', input: { value: 1 } })
    ).resolves.toMatchObject({ output: { content: 'skill-result' } });

    expect(agent.executeScopedTask).toHaveBeenCalledWith(
      { type: 'skill', input: { value: 1 } },
      expect.objectContaining({
        systemPrompt: skill.type === 'skill' ? skill.promptTemplate : '',
        tools: [
          expect.objectContaining({
            name: addTool.name,
          }),
        ],
      })
    );
  });

  it('executes a cached Plugin and enforces the same nested capability context', async () => {
    const pluginRunner: CachedPluginRunner = {
      execute: vi.fn(
        async (
          _capability: PluginCapability,
          _task: AgentTask,
          context: WasiPluginExecutionContext
        ) =>
          context.executeCapability(addTool.id, {
            type: 'plugin-host',
            input: { left: 4, right: 5 },
          })
      ),
    };
    const localFunction = vi.fn(async (_tool, args) => ({
      total: Number(args.left) + Number(args.right),
    }));
    const { source } = createSource({
      capabilities: [addTool, plugin],
      adapters: { 'local-function': localFunction },
      pluginRunner,
    });

    await expect(
      source.executeCapability(plugin.id, { type: 'plugin', input: {} })
    ).resolves.toMatchObject({
      output: { structured: { result: { total: 9 } } },
    });
    expect(pluginRunner.execute).toHaveBeenCalledOnce();
  });

  it('rejects recursive cached capability calls', async () => {
    const pluginRunner: CachedPluginRunner = {
      execute: vi.fn(async (capability, task, context) =>
        context.executeCapability(capability.id, task)
      ),
    };
    const { source } = createSource({
      capabilities: [plugin],
      pluginRunner,
    });

    await expect(
      source.executeCapability(plugin.id, { type: 'plugin', input: {} })
    ).rejects.toMatchObject({ code: 'CAPABILITY_EXECUTION_CYCLE' });
  });

  it('rejects nested execution beyond the configured depth', async () => {
    const secondPlugin: PluginCapability = {
      ...plugin,
      id: 'plugin:second',
      name: 'second-plugin',
      allowedCapabilities: ['plugin:third'],
    };
    const thirdPlugin: PluginCapability = {
      ...plugin,
      id: 'plugin:third',
      name: 'third-plugin',
      allowedCapabilities: [],
    };
    const pluginRunner: CachedPluginRunner = {
      execute: vi.fn(async (capability, task, context) => {
        const nextId = capability.id === plugin.id ? secondPlugin.id : plugin.id;
        if (capability.id === secondPlugin.id) {
          return context.executeCapability(thirdPlugin.id, task);
        }
        return context.executeCapability(nextId, task);
      }),
    };
    const { source } = createSource({
      capabilities: [plugin, secondPlugin, thirdPlugin],
      pluginRunner,
      maxDepth: 2,
    });

    await expect(
      source.executeCapability(plugin.id, { type: 'plugin', input: {} })
    ).rejects.toMatchObject({ code: 'MAX_CAPABILITY_DEPTH_EXCEEDED' });
  });
});

function createSource(options: {
  capabilities: Capability[];
  adapters?: ToolAdapterMap;
  pluginRunner?: CachedPluginRunner;
  maxDepth?: number;
}): { source: CachedCapabilitySource; agent: IClientAgent } {
  const capabilityMap = new Map(options.capabilities.map((item) => [item.id, item]));
  const cache: CachedCapabilityStore = {
    list: () => [...capabilityMap.values()],
    get: (id) => capabilityMap.get(id),
    readPluginArtifact: vi.fn(async () => new Uint8Array()),
  };
  const agent = createAgent();
  const source = new CachedCapabilitySource({
    cache,
    agent,
    logger: createLogger(),
    adapters:
      options.adapters ??
      ({ 'local-function': vi.fn(async () => ({ ok: true })) } satisfies ToolAdapterMap),
    pluginRunner:
      options.pluginRunner ??
      ({ execute: vi.fn(async () => success('plugin-result')) } satisfies CachedPluginRunner),
    maxDepth: options.maxDepth,
  });
  return { source, agent };
}

function createAgent(): IClientAgent {
  return {
    id: 'client',
    name: 'client',
    role: 'client',
    version: '1.0.0',
    capabilities: [],
    status: AgentStatus.READY,
    init: vi.fn(async () => undefined),
    execute: vi.fn(async () => success('agent')),
    stream: async function* (): AsyncIterable<AgentStreamChunk> {},
    destroy: vi.fn(async () => undefined),
    on() {
      return this;
    },
    off() {
      return this;
    },
    startDaemon: vi.fn(async () => undefined),
    stopDaemon: vi.fn(async () => undefined),
    connectToHub: vi.fn(async () => undefined),
    disconnectFromHub: vi.fn(async () => undefined),
    getLocalCapabilityCache: vi.fn(() => []),
    setCapabilitySource: vi.fn(),
    executeLocalCapability: vi.fn(async () => success('local')),
    executeScopedTask: vi.fn(async () => success('scoped')),
    authorizeLocalCommand: vi.fn(async () => undefined),
    getLocalCommandAuthorization: vi.fn(() => 'disabled'),
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

function success(content: string): AgentResult {
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
