import { describe, it, expect } from 'vitest';
import type {
  IAgent,
  AgentResult,
  AgentEvent,
  Capability,
  PipelineControlSignal,
} from '../src/index.js';
import { AgentStatus, CapabilityType } from '../src/index.js';

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
      execute: async () => ({ success: true } as AgentResult),
      stream: async function* () {},
      destroy: async () => {},
      use: function () {
        return this;
      },
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

  it('complex nested interfaces compile', () => {
    const capability: Capability = {
      id: 'cap-1',
      name: 'test-capability',
      type: 'tool',
      description: 'A test capability',
    };

    const signal: PipelineControlSignal = {
      action: 'continue',
    };

    expect(capability.name).toBe('test-capability');
    expect(signal.action).toBe('continue');
  });
});
