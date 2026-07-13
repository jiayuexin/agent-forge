import { describe, it, expect } from 'vitest';
import type {
  IAgent,
  AgentResult,
  AgentEvent,
  AgentCapabilityRegistration,
  CapabilityType,
  Capability,
  AgentCapabilityDefinition,
  RemoteAgentCapability,
  ToolCapability,
  SkillCapability,
  PluginCapability,
  SandboxConfig,
  Message,
  CapabilityDistributePayload,
  Middleware,
  PipelineControlSignal,
} from '../src/index.js';
import { AgentStatus } from '../src/index.js';

describe('@agentforge/types exports', () => {
  it('exports AgentStatus enum values', () => {
    expect(AgentStatus.UNINITIALIZED).toBe('uninitialized');
    expect(AgentStatus.INITIALIZING).toBe('initializing');
    expect(AgentStatus.READY).toBe('ready');
    expect(AgentStatus.DAEMON_RUNNING).toBe('daemon-running');
    expect(AgentStatus.RUNNING).toBe('running');
    expect(AgentStatus.ERROR).toBe('error');
    expect(AgentStatus.DESTROYED).toBe('destroyed');
  });

  it('exports CapabilityType literal union', () => {
    const type: CapabilityType = 'agent';
    expect(type).toBe('agent');
  });

  it('type-only exports compile for key interfaces', () => {
    const agentLike: IAgent = {
      id: '1',
      name: 'test-agent',
      role: 'tester',
      version: '0.0.1',
      capabilities: [],
      status: AgentStatus.READY,
      init: async () => {},
      execute: async () => ({ success: true }) as AgentResult,
      stream: async function* () {},
      destroy: async () => {},
      on: function () {
        return this;
      },
      off: function () {
        return this;
      },
    };
    expect(agentLike.status).toBe(AgentStatus.READY);
  });

  it('AgentEvent literal union is available at compile time', () => {
    const event: AgentEvent = 'agent:ready';
    expect(event).toBe('agent:ready');
  });

  it('exports the five discriminated capability definitions', () => {
    const agent = {
      id: 'agent-reviewer',
      name: 'reviewer',
      type: 'agent',
      description: 'Reviews code',
    } satisfies AgentCapabilityDefinition;

    const remoteAgent = {
      id: 'remote-agent-reviewer',
      name: 'remote-reviewer',
      type: 'remote-agent',
      description: 'Reviews code remotely',
      nodeId: 'node-1',
      endpoint: 'wss://hub.example.com/ws/nodes/node-1',
    } satisfies RemoteAgentCapability;

    const tool = {
      id: 'tool-git-status',
      name: 'git-status',
      type: 'tool',
      description: 'Reads the Git working tree status',
      endpointType: 'local-command',
      endpoint: {
        target: 'git status --porcelain',
        method: 'exec',
      },
      inputSchema: { type: 'object' },
      outputSchema: { type: 'string' },
    } satisfies ToolCapability;

    const skill = {
      id: 'skill-review',
      name: 'review',
      type: 'skill',
      description: 'Combines review tools',
      tools: ['tool-git-status'],
      promptTemplate: 'Review the current changes.',
      examples: [{ input: { path: 'src' }, output: { issues: [] } }],
    } satisfies SkillCapability;

    const sandbox = {
      timeoutMs: 30_000,
      maxMemoryPages: 256,
    } satisfies SandboxConfig;

    const plugin = {
      id: 'plugin-review',
      name: 'review-plugin',
      type: 'plugin',
      description: 'Runs a signed review plugin',
      downloadUrl: 'https://example.com/review-plugin.wasm',
      signature: 'base64-signature',
      keyId: 'key-1',
      entry: 'review.wasm',
      allowedCapabilities: ['tool-git-status'],
      sandbox,
    } satisfies PluginCapability;

    const capabilities = [agent, remoteAgent, tool, skill, plugin] satisfies Capability[];

    const signal: PipelineControlSignal = {
      action: 'continue',
    };

    expect(capabilities.map((capability) => capability.type)).toEqual([
      'agent',
      'remote-agent',
      'tool',
      'skill',
      'plugin',
    ]);
    expect(signal.action).toBe('continue');
  });

  it('represents assistant tool calls with ToolCallRequest', () => {
    const message = {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          name: 'git-status',
          args: { cwd: '/workspace' },
          callId: 'call-1',
        },
      ],
    } satisfies Message;

    expect(message.toolCalls[0].callId).toBe('call-1');
  });

  it('keeps plugin distribution metadata inside the capability', () => {
    const payload = {
      action: 'add',
      capability: {
        id: 'plugin-review',
        name: 'review-plugin',
        type: 'plugin',
        description: 'Runs a signed review plugin',
        downloadUrl: 'https://example.com/review-plugin.wasm',
        signature: 'base64-signature',
        keyId: 'key-1',
        entry: 'review.wasm',
        allowedCapabilities: [],
        sandbox: {
          timeoutMs: 30_000,
          maxMemoryPages: 256,
        },
      },
      targetVersion: '1.0.0',
    } satisfies CapabilityDistributePayload;

    expect(payload.capability.downloadUrl).toContain('review-plugin');
    expect('downloadUrl' in payload).toBe(false);
    expect('signature' in payload).toBe(false);
  });

  it('keeps Middleware as the plugin module contract', () => {
    const middleware = {
      name: 'audit',
      before: async (task) => task,
    } satisfies Middleware;

    expect(middleware.name).toBe('audit');
  });

  it('rejects incomplete discriminated capability variants at compile time', () => {
    // @ts-expect-error Tool capabilities require endpointType, endpoint, and inputSchema.
    const incompleteTool: ToolCapability = {
      id: 'tool-incomplete',
      type: 'tool',
      name: 'incomplete',
      description: 'Missing its execution contract',
    };

    // @ts-expect-error Skill capabilities require tools and promptTemplate.
    const incompleteSkill: SkillCapability = {
      id: 'skill-incomplete',
      type: 'skill',
      name: 'incomplete',
      description: 'Missing its composition contract',
    };

    // @ts-expect-error Plugin capabilities require signed package and sandbox metadata.
    const incompletePlugin: PluginCapability = {
      id: 'plugin-incomplete',
      type: 'plugin',
      name: 'incomplete',
      description: 'Missing its package contract',
    };

    // @ts-expect-error Remote Agent capabilities require a nodeId.
    const incompleteRemoteAgent: RemoteAgentCapability = {
      id: 'remote-incomplete',
      type: 'remote-agent',
      name: 'incomplete',
      description: 'Missing its node reference',
    };

    const invalidRegistration: AgentCapabilityRegistration = {
      // @ts-expect-error Agent registration cannot declare a non-Agent capability.
      type: 'tool',
    };

    // @ts-expect-error plugin.ts only exports Middleware.
    const removedMiddlewareConfig: import('../src/plugin.js').MiddlewareConfig = {
      name: 'removed',
    };

    expect([
      incompleteTool,
      incompleteSkill,
      incompletePlugin,
      incompleteRemoteAgent,
      invalidRegistration,
      removedMiddlewareConfig,
    ]).toHaveLength(6);
  });
});
