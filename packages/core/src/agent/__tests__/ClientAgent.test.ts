import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatus, type ClientAgentConfig } from '@agentforge/types';
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

  it('stopDaemon, connectToHub, disconnectFromHub are safe no-ops', async () => {
    const agent = new ClientAgent(clientConfig);
    await expect(agent.stopDaemon()).resolves.toBeUndefined();
    await expect(agent.connectToHub('http://localhost', 'token')).resolves.toBeUndefined();
    await expect(agent.disconnectFromHub()).resolves.toBeUndefined();
  });

  it('getLocalCapabilityCache returns empty array', () => {
    const agent = new ClientAgent(clientConfig);
    expect(agent.getLocalCapabilityCache()).toEqual([]);
  });
});
