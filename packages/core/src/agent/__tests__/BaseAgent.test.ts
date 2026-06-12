import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../BaseAgent';
import { AgentLifeCycle, AgentStatusError } from '../AgentLifeCycle';
import { AgentStatus } from '@agentforge/types';
import type { AgentTask, AgentResult, AgentConfig, IPlugin, PluginContext, EventHandler } from '@agentforge/types';

// --- Concrete test subclass ---

class TestAgent extends BaseAgent<AgentConfig> {
  protected async doInit(): Promise<void> {
    // no-op
  }

  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return {
      success: true,
      output: { content: `executed: ${task.type}` },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'test',
      },
    };
  }
}

// --- AgentLifeCycle tests ---

describe('AgentLifeCycle', () => {
  let lifecycle: AgentLifeCycle;

  beforeEach(() => {
    lifecycle = new AgentLifeCycle();
  });

  it('starts as UNINITIALIZED', () => {
    expect(lifecycle.status).toBe(AgentStatus.UNINITIALIZED);
  });

  it('allows UNINITIALIZED → INITIALIZING', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    expect(lifecycle.status).toBe(AgentStatus.INITIALIZING);
  });

  it('allows INITIALIZING → READY', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    lifecycle.transition(AgentStatus.READY);
    expect(lifecycle.status).toBe(AgentStatus.READY);
  });

  it('allows INITIALIZING → ERROR', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    lifecycle.transition(AgentStatus.ERROR);
    expect(lifecycle.status).toBe(AgentStatus.ERROR);
  });

  it('allows READY → RUNNING', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    lifecycle.transition(AgentStatus.READY);
    lifecycle.transition(AgentStatus.RUNNING);
    expect(lifecycle.status).toBe(AgentStatus.RUNNING);
  });

  it('allows RUNNING → READY', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    lifecycle.transition(AgentStatus.READY);
    lifecycle.transition(AgentStatus.RUNNING);
    lifecycle.transition(AgentStatus.READY);
    expect(lifecycle.status).toBe(AgentStatus.READY);
  });

  it('allows RUNNING → PAUSED', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    lifecycle.transition(AgentStatus.READY);
    lifecycle.transition(AgentStatus.RUNNING);
    lifecycle.transition(AgentStatus.PAUSED);
    expect(lifecycle.status).toBe(AgentStatus.PAUSED);
  });

  it('allows RUNNING → ERROR', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    lifecycle.transition(AgentStatus.READY);
    lifecycle.transition(AgentStatus.RUNNING);
    lifecycle.transition(AgentStatus.ERROR);
    expect(lifecycle.status).toBe(AgentStatus.ERROR);
  });

  it('allows PAUSED → RUNNING', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    lifecycle.transition(AgentStatus.READY);
    lifecycle.transition(AgentStatus.RUNNING);
    lifecycle.transition(AgentStatus.PAUSED);
    lifecycle.transition(AgentStatus.RUNNING);
    expect(lifecycle.status).toBe(AgentStatus.RUNNING);
  });

  it('allows ERROR → READY', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    lifecycle.transition(AgentStatus.ERROR);
    lifecycle.transition(AgentStatus.READY);
    expect(lifecycle.status).toBe(AgentStatus.READY);
  });

  it('allows any state → DESTROYED', () => {
    for (const from of [
      AgentStatus.UNINITIALIZED,
      AgentStatus.INITIALIZING,
      AgentStatus.READY,
      AgentStatus.RUNNING,
      AgentStatus.PAUSED,
      AgentStatus.ERROR,
    ]) {
      const lc = new AgentLifeCycle();
      // get to the desired state
      if (from !== AgentStatus.UNINITIALIZED) {
        lc.transition(AgentStatus.INITIALIZING);
        if (from === AgentStatus.READY || from === AgentStatus.RUNNING || from === AgentStatus.PAUSED) {
          lc.transition(AgentStatus.READY);
        }
        if (from === AgentStatus.RUNNING || from === AgentStatus.PAUSED) {
          lc.transition(AgentStatus.RUNNING);
        }
        if (from === AgentStatus.PAUSED) {
          lc.transition(AgentStatus.PAUSED);
        }
        if (from === AgentStatus.ERROR) {
          lc.transition(AgentStatus.ERROR);
        }
      }
      lc.transition(AgentStatus.DESTROYED);
      expect(lc.status).toBe(AgentStatus.DESTROYED);
    }
  });

  it('throws on invalid transitions', () => {
    expect(() => lifecycle.transition(AgentStatus.READY)).toThrow(AgentStatusError);
    expect(() => lifecycle.transition(AgentStatus.RUNNING)).toThrow(AgentStatusError);
  });

  it('throws AgentStatusError with correct from/to', () => {
    try {
      lifecycle.transition(AgentStatus.READY);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentStatusError);
      expect((err as AgentStatusError).from).toBe(AgentStatus.UNINITIALIZED);
      expect((err as AgentStatusError).to).toBe(AgentStatus.READY);
    }
  });

  it('no transitions allowed from DESTROYED', () => {
    lifecycle.transition(AgentStatus.DESTROYED);
    expect(() => lifecycle.transition(AgentStatus.READY)).toThrow(AgentStatusError);
  });

  it('canTransition returns true for valid, false for invalid', () => {
    expect(lifecycle.canTransition(AgentStatus.INITIALIZING)).toBe(true);
    expect(lifecycle.canTransition(AgentStatus.READY)).toBe(false);
    expect(lifecycle.canTransition(AgentStatus.DESTROYED)).toBe(true);
  });

  it('assertStatus passes for current status', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    expect(() => lifecycle.assertStatus(AgentStatus.INITIALIZING)).not.toThrow();
  });

  it('assertStatus passes for any of the expected statuses', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    expect(() => lifecycle.assertStatus(AgentStatus.READY, AgentStatus.INITIALIZING)).not.toThrow();
  });

  it('assertStatus throws for unexpected status', () => {
    lifecycle.transition(AgentStatus.INITIALIZING);
    expect(() => lifecycle.assertStatus(AgentStatus.READY, AgentStatus.RUNNING)).toThrow(AgentStatusError);
  });
});

// --- BaseAgent tests ---

describe('BaseAgent', () => {
  let agent: TestAgent;

  const defaultConfig: AgentConfig = {
    model: {
      provider: 'openai',
      modelName: 'gpt-4',
      apiKey: 'test-key',
    },
    systemPrompt: 'You are a test agent.',
  };

  beforeEach(() => {
    agent = new TestAgent({ name: 'test', role: 'tester' });
  });

  // --- Construction ---

  it('sets id, name, role, version from constructor', () => {
    expect(agent.name).toBe('test');
    expect(agent.role).toBe('tester');
    expect(agent.version).toBe('1.0.0');
    expect(agent.id).toMatch(/^agent-test-\d+$/);
  });

  it('uses custom version when provided', () => {
    const custom = new TestAgent({ name: 'v2', role: 'r', version: '2.0.0' });
    expect(custom.version).toBe('2.0.0');
  });

  it('starts as UNINITIALIZED', () => {
    expect(agent.status).toBe(AgentStatus.UNINITIALIZED);
  });

  it('has empty capabilities by default', () => {
    expect(agent.capabilities).toEqual([]);
  });

  // --- Init / execute / destroy lifecycle ---

  it('transitions UNINITIALIZED → INITIALIZING → READY on init', async () => {
    await agent.init(defaultConfig);
    expect(agent.status).toBe(AgentStatus.READY);
  });

  it('transitions READY → RUNNING → READY on execute', async () => {
    await agent.init(defaultConfig);
    const result = await agent.execute({ type: 'greet', input: {} });
    expect(agent.status).toBe(AgentStatus.READY);
    expect(result.success).toBe(true);
    expect(result.output.content).toBe('executed: greet');
  });

  it('transitions to DESTROYED on destroy', async () => {
    await agent.init(defaultConfig);
    await agent.destroy();
    expect(agent.status).toBe(AgentStatus.DESTROYED);
  });

  it('full lifecycle: init → execute → destroy', async () => {
    await agent.init(defaultConfig);
    expect(agent.status).toBe(AgentStatus.READY);

    await agent.execute({ type: 'task1', input: {} });
    expect(agent.status).toBe(AgentStatus.READY);

    await agent.destroy();
    expect(agent.status).toBe(AgentStatus.DESTROYED);
  });

  // --- Error handling ---

  it('transitions to ERROR when doInit throws', async () => {
    class FailInitAgent extends BaseAgent<AgentConfig> {
      protected async doInit(): Promise<void> {
        throw new Error('init failed');
      }
      protected async doExecute(): Promise<AgentResult> {
        return { success: true, output: { content: '' }, meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: '' } };
      }
    }
    const failAgent = new FailInitAgent({ name: 'fail', role: 'r' });
    await expect(failAgent.init(defaultConfig)).rejects.toThrow('init failed');
    expect(failAgent.status).toBe(AgentStatus.ERROR);
  });

  it('transitions to ERROR when doExecute throws', async () => {
    class FailExecAgent extends BaseAgent<AgentConfig> {
      protected async doInit(): Promise<void> {}
      protected async doExecute(): Promise<AgentResult> {
        throw new Error('exec failed');
      }
    }
    const failAgent = new FailExecAgent({ name: 'fail', role: 'r' });
    await failAgent.init(defaultConfig);
    await expect(failAgent.execute({ type: 'x', input: {} })).rejects.toThrow('exec failed');
    expect(failAgent.status).toBe(AgentStatus.ERROR);
  });

  it('throws when executing on UNINITIALIZED agent', async () => {
    await expect(agent.execute({ type: 'x', input: {} })).rejects.toThrow();
  });

  // --- Event emission ---

  it('emits agent:init on successful init', async () => {
    const handler = vi.fn();
    agent.on('agent:init', handler);
    await agent.init(defaultConfig);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ agentId: agent.id });
  });

  it('emits agent:execute:start and agent:execute:end on execute', async () => {
    const startHandler = vi.fn();
    const endHandler = vi.fn();
    agent.on('agent:execute:start', startHandler);
    agent.on('agent:execute:end', endHandler);
    await agent.init(defaultConfig);
    await agent.execute({ type: 't', input: {} });
    expect(startHandler).toHaveBeenCalledOnce();
    expect(endHandler).toHaveBeenCalledOnce();
  });

  it('emits agent:error when execute fails', async () => {
    class FailExecAgent extends BaseAgent<AgentConfig> {
      protected async doInit(): Promise<void> {}
      protected async doExecute(): Promise<AgentResult> {
        throw new Error('boom');
      }
    }
    const failAgent = new FailExecAgent({ name: 'fail', role: 'r' });
    const errorHandler = vi.fn();
    failAgent.on('agent:error', errorHandler);
    await failAgent.init(defaultConfig);
    await expect(failAgent.execute({ type: 'x', input: {} })).rejects.toThrow('boom');
    expect(errorHandler).toHaveBeenCalledOnce();
  });

  it('emits agent:destroy on destroy', async () => {
    const handler = vi.fn();
    agent.on('agent:destroy', handler);
    await agent.init(defaultConfig);
    await agent.destroy();
    expect(handler).toHaveBeenCalledOnce();
  });

  // --- Event handler registration ---

  it('on() returns this for chaining', () => {
    const result = agent.on('agent:init', vi.fn());
    expect(result).toBe(agent);
  });

  it('off() removes a handler', async () => {
    const handler = vi.fn();
    agent.on('agent:init', handler);
    agent.off('agent:init', handler);
    await agent.init(defaultConfig);
    expect(handler).not.toHaveBeenCalled();
  });

  it('off() returns this for chaining', () => {
    const handler = vi.fn();
    agent.on('agent:init', handler);
    const result = agent.off('agent:init', handler);
    expect(result).toBe(agent);
  });

  it('multiple handlers for same event are all called', async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    agent.on('agent:init', h1);
    agent.on('agent:init', h2);
    await agent.init(defaultConfig);
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  // --- Plugin system ---

  it('use() installs a plugin and returns this', async () => {
    const installFn = vi.fn();
    const plugin: IPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      install: installFn,
    };

    await agent.init(defaultConfig);
    const result = agent.use(plugin);
    expect(result).toBe(agent);
    expect(installFn).toHaveBeenCalledOnce();
    expect(installFn).toHaveBeenCalledWith(agent, expect.any(Object));
  });

  it('provides PluginContext with registerTool, registerMiddleware, config, logger', async () => {
    let receivedContext: PluginContext | undefined;
    const plugin: IPlugin = {
      name: 'ctx-plugin',
      version: '1.0.0',
      install(_agent, context) {
        receivedContext = context;
      },
    };

    await agent.init(defaultConfig);
    agent.use(plugin);

    expect(receivedContext).toBeDefined();
    expect(typeof receivedContext!.registerTool).toBe('function');
    expect(typeof receivedContext!.registerMiddleware).toBe('function');
    expect(receivedContext!.config).toBeDefined();
    expect(receivedContext!.logger).toBeDefined();
  });

  it('calls plugin.uninstall on destroy', async () => {
    const uninstallFn = vi.fn();
    const plugin: IPlugin = {
      name: 'uninstall-plugin',
      version: '1.0.0',
      install() {},
      uninstall: uninstallFn,
    };

    await agent.init(defaultConfig);
    agent.use(plugin);
    await agent.destroy();
    expect(uninstallFn).toHaveBeenCalledOnce();
  });

  it('middleware before/after hooks are called during execute', async () => {
    const beforeFn = vi.fn(async (task: AgentTask) => task);
    const afterFn = vi.fn(async (result: AgentResult) => result);

    const plugin: IPlugin = {
      name: 'mw-plugin',
      version: '1.0.0',
      install(_agent, context) {
        context.registerMiddleware({ name: 'test-mw', before: beforeFn, after: afterFn });
      },
    };

    await agent.init(defaultConfig);
    agent.use(plugin);
    await agent.execute({ type: 't', input: { key: 'val' } });

    expect(beforeFn).toHaveBeenCalledOnce();
    expect(afterFn).toHaveBeenCalledOnce();
  });

  // --- Stream fallback ---

  it('stream() falls back to execute when doStream is not implemented', async () => {
    await agent.init(defaultConfig);
    const chunks: AgentResult[] = [];
    for await (const chunk of agent.stream({ type: 't', input: {} })) {
      chunks.push(chunk as unknown as AgentResult);
    }
    // Should get at least a text chunk and a done chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  // --- Destroy from any state ---

  it('can destroy from UNINITIALIZED state', async () => {
    await agent.destroy();
    expect(agent.status).toBe(AgentStatus.DESTROYED);
  });

  // --- Invalid transitions via agent methods ---

  it('cannot execute after destroy', async () => {
    await agent.init(defaultConfig);
    await agent.destroy();
    await expect(agent.execute({ type: 'x', input: {} })).rejects.toThrow();
  });
});
