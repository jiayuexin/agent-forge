import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AgentStatus,
  type AgentResult,
  type Capability,
  type ClientCapabilitySource,
  type ClientAgentConfig,
  type IProvider,
  type ToolDefinition,
} from '@agentforge/types';
import { ClientAgent } from '../ClientAgent.js';
import { ProviderFactory } from '../../provider/ProviderFactory.js';
import { MockProvider } from '../../provider/MockProvider.js';

vi.mock('../../security/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../security/index.js')>();
  return {
    ...actual,
    askLocalUserConfirmation: vi.fn(),
  };
});

import { askLocalUserConfirmation } from '../../security/index.js';

beforeAll(() => {
  ProviderFactory.register('mock', MockProvider);
});

const clientConfig: ClientAgentConfig = {
  identity: { name: 'client', role: 'assistant', version: '0.0.1' },
  model: { provider: 'mock', modelName: 'mock-model' },
  systemPrompt: 'helpful',
  localCommandAuth: { level: 'readonly' },
};

describe('ClientAgent', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'client-agent-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('starts daemon and transitions to daemon-running', async () => {
    const agent = new ClientAgent(clientConfig);
    await agent.init();
    await agent.startDaemon();
    expect(agent.status).toBe(AgentStatus.DAEMON_RUNNING);
  });

  it('returns local command auth level', async () => {
    const agent = new ClientAgent(clientConfig);
    expect(agent.getLocalCommandAuthorization()).toBe('readonly');
  });

  it('defaults local command auth to disabled', () => {
    const agent = new ClientAgent({
      ...clientConfig,
      localCommandAuth: undefined,
    });
    expect(agent.getLocalCommandAuthorization()).toBe('disabled');
  });

  it('authorizes readonly commands and records success audit', async () => {
    const agent = new ClientAgent({
      ...clientConfig,
      localCommandAuth: { level: 'readonly' },
    });
    (agent as unknown as { auditLog: { filePath: string } }).auditLog.filePath = join(
      tempDir,
      'audit.log'
    );

    await agent.authorizeLocalCommand('ls');

    const log = await readFile(join(tempDir, 'audit.log'), 'utf-8');
    const events = log
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'local-command',
      resource: 'ls',
      outcome: 'success',
    });
  });

  it('denies non-readonly commands and records denied audit', async () => {
    const agent = new ClientAgent({
      ...clientConfig,
      localCommandAuth: { level: 'readonly' },
    });
    (agent as unknown as { auditLog: { filePath: string } }).auditLog.filePath = join(
      tempDir,
      'audit.log'
    );

    await expect(agent.authorizeLocalCommand('rm -rf /')).rejects.toMatchObject({
      code: 'COMMAND_DENIED',
    });

    const log = await readFile(join(tempDir, 'audit.log'), 'utf-8');
    const events = log
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({
      action: 'local-command',
      resource: 'rm -rf /',
      outcome: 'denied',
    });
  });

  it('full level prompts for confirmation and succeeds when user accepts', async () => {
    vi.mocked(askLocalUserConfirmation).mockResolvedValue(true);

    const agent = new ClientAgent({
      ...clientConfig,
      localCommandAuth: { level: 'full' },
    });
    (agent as unknown as { auditLog: { filePath: string } }).auditLog.filePath = join(
      tempDir,
      'audit.log'
    );

    await agent.authorizeLocalCommand('git push origin main');

    expect(askLocalUserConfirmation).toHaveBeenCalledWith(
      { type: 'local-command', input: { command: 'git push origin main' } },
      'Allow local command "git push origin main"? [y/N] '
    );

    const log = await readFile(join(tempDir, 'audit.log'), 'utf-8');
    const events = log
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({ outcome: 'success' });
  });

  it('full level throws USER_REJECTED when user declines confirmation', async () => {
    vi.mocked(askLocalUserConfirmation).mockResolvedValue(false);

    const agent = new ClientAgent({
      ...clientConfig,
      localCommandAuth: { level: 'full' },
    });
    (agent as unknown as { auditLog: { filePath: string } }).auditLog.filePath = join(
      tempDir,
      'audit.log'
    );

    await expect(agent.authorizeLocalCommand('git push origin main')).rejects.toMatchObject({
      code: 'USER_REJECTED',
    });

    const log = await readFile(join(tempDir, 'audit.log'), 'utf-8');
    const events = log
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({ outcome: 'denied' });
  });

  it('doExecute throws when provider is not initialized', async () => {
    const agent = new ClientAgent(clientConfig);
    await expect(
      (
        agent as unknown as {
          doExecute: (task: { type: string; input: Record<string, unknown> }) => Promise<unknown>;
        }
      ).doExecute({
        type: 'test',
        input: { message: 'hello' },
      })
    ).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
  });

  it('doExecute returns provider result after initialization', async () => {
    const agent = new ClientAgent(clientConfig);
    await agent.init();
    const result = await agent.execute({ type: 'test', input: { message: 'hello' } });
    expect(result.success).toBe(true);
    expect(result.output.content).toBe('mock: {"message":"hello"}');
  });

  it('executes while the daemon is running and returns to daemon-running', async () => {
    const agent = new ClientAgent(clientConfig);
    await agent.init();
    await agent.startDaemon();
    const result = await agent.execute({ type: 'test', input: { message: 'hello' } });
    expect(result.success).toBe(true);
    expect(result.output.content).toBe('mock: {"message":"hello"}');
    expect(agent.status).toBe(AgentStatus.DAEMON_RUNNING);
  });

  it('executes a handler supplied by the dynamic tool provider', async () => {
    const handler = vi.fn().mockResolvedValue('dynamic-result');
    const dynamicTool: ToolDefinition = {
      name: 'dynamic-tool',
      description: 'Dynamic tool',
      parameters: { type: 'object' },
      handler,
    };
    const provider: IProvider = {
      provider: 'tool-test',
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [{ callId: 'call-1', name: 'dynamic-tool', args: {} }],
          usage: { input: 1, output: 1, total: 2 },
          model: 'tool-test',
          finishReason: 'tool_calls',
        })
        .mockResolvedValueOnce({
          content: 'done',
          usage: { input: 1, output: 1, total: 2 },
          model: 'tool-test',
          finishReason: 'stop',
        }),
      chatStream: async function* () {},
      validate: async () => true,
    };
    const agent = new ClientAgent(clientConfig, {
      toolProvider: () => [dynamicTool],
    });
    await agent.init();
    (agent as unknown as { provider: IProvider }).provider = provider;

    const result = await agent.execute({ type: 'test', input: {} });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.meta.toolsCalled).toEqual([
      expect.objectContaining({
        name: 'dynamic-tool',
        result: 'dynamic-result',
        status: 'success',
      }),
    ]);
  });

  it('stopDaemon, connectToHub, disconnectFromHub are safe no-ops', async () => {
    const agent = new ClientAgent(clientConfig);
    await expect(agent.stopDaemon()).resolves.toBeUndefined();
    await expect(agent.connectToHub('http://localhost', 'token')).resolves.toBeUndefined();
    await expect(agent.disconnectFromHub()).resolves.toBeUndefined();
  });

  it('uses an attached capability source for cache listing and dynamic tools', async () => {
    const capability: Capability = {
      id: 'tool:cached',
      type: 'tool',
      name: 'cached-tool',
      description: 'Cached tool',
      endpointType: 'local-function',
      endpoint: { target: 'cached.tool' },
      inputSchema: { type: 'object' },
    };
    const handler = vi.fn(async () => 'cached-result');
    const tool: ToolDefinition = {
      name: capability.name,
      description: capability.description,
      parameters: capability.inputSchema,
      handler,
    };
    const execution: AgentResult = {
      success: true,
      output: { content: 'direct-result' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'capability',
      },
    };
    const source: ClientCapabilitySource = {
      listCapabilities: () => [capability],
      listTools: () => [tool],
      executeCapability: vi.fn(async () => execution),
    };
    const provider: IProvider = {
      provider: 'tool-test',
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [{ callId: 'call-1', name: tool.name, args: {} }],
          usage: { input: 1, output: 1, total: 2 },
          model: 'tool-test',
          finishReason: 'tool_calls',
        })
        .mockResolvedValueOnce({
          content: 'done',
          usage: { input: 1, output: 1, total: 2 },
          model: 'tool-test',
          finishReason: 'stop',
        }),
      chatStream: async function* () {},
      validate: async () => true,
    };
    const agent = new ClientAgent(clientConfig);
    agent.setCapabilitySource(source);
    await agent.init();
    (agent as unknown as { provider: IProvider }).provider = provider;

    expect(agent.getLocalCapabilityCache()).toEqual([capability]);
    await expect(
      agent.executeLocalCapability(capability.id, {
        type: 'direct',
        input: {},
      })
    ).resolves.toBe(execution);
    await agent.execute({ type: 'agent', input: {} });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('executes a scoped task with an isolated prompt and tool list', async () => {
    const provider: IProvider = {
      provider: 'scope-test',
      chat: vi.fn(async () => ({
        content: 'scoped-result',
        usage: { input: 1, output: 1, total: 2 },
        model: 'scope-test',
        finishReason: 'stop',
      })),
      chatStream: async function* () {},
      validate: async () => true,
    };
    const agent = new ClientAgent(clientConfig);
    await agent.init();
    (agent as unknown as { provider: IProvider }).provider = provider;
    const tools: ToolDefinition[] = [
      {
        name: 'only-tool',
        description: 'Only scoped tool',
        parameters: { type: 'object' },
        handler: async () => 'unused',
      },
    ];

    await expect(
      agent.executeScopedTask(
        { type: 'scope', input: { value: 1 } },
        { systemPrompt: 'scoped prompt', tools }
      )
    ).resolves.toMatchObject({ output: { content: 'scoped-result' } });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'system', content: 'scoped prompt' }]),
        tools: [
          expect.objectContaining({
            name: tools[0].name,
            description: tools[0].description,
            parameters: tools[0].parameters,
          }),
        ],
      })
    );
  });
});
