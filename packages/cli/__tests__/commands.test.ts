import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerListCommand } from '../src/commands/list.js';
import { registerServeCommand } from '../src/commands/serve.js';
import { registerDashboardCommand } from '../src/commands/dashboard.js';
import { registerCapabilityCommand } from '../src/commands/capability.js';
import { registerBatchCommand } from '../src/commands/batch.js';
import { registerRunCommand } from '../src/commands/run.js';
import { startTestHub } from '../../dashboard/__tests__/helpers.js';
import { openHubRepository } from '../../dashboard/server/storage/sqlite.js';
import { TokenStore } from '../../dashboard/server/services/TokenStore.js';

describe('CLI commands', () => {
  let tempDir: string;
  let hubServer: Awaited<ReturnType<typeof startTestHub>> | undefined;

  afterEach(async () => {
    if (hubServer) {
      await hubServer.hub.stop();
      hubServer = undefined;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('lists agents and rejects invalid list format', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cli-list-'));
    const program = new Command();
    registerListCommand(program);
    await program.parseAsync(['node', 'agentforge', 'list', '--path', tempDir, '--output', 'json']);
    const invalid = new Command();
    registerListCommand(invalid);
    await expect(
      invalid.parseAsync(['node', 'agentforge', 'list', '--path', tempDir, '--output', 'xml'])
    ).rejects.toThrow(/Invalid --output format/);
  });

  it('requires a path for serve', async () => {
    const program = new Command();
    registerServeCommand(program);
    await expect(program.parseAsync(['node', 'agentforge', 'serve'])).rejects.toThrow(
      'client-agent-path is required'
    );
  });

  it('requires a token for run after the agent is loaded', async () => {
    const program = new Command();
    registerRunCommand(program);
    await expect(
      program.parseAsync(['node', 'agentforge', 'run', '/missing-agent'])
    ).rejects.toThrow(/Cannot find agent entry/);
  });

  it('creates, lists, and revokes tokens offline', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cli-token-'));
    const program = new Command();
    registerDashboardCommand(program);
    await program.parseAsync([
      'node',
      'agentforge',
      'dashboard',
      'token',
      'create',
      '--offline',
      '--data-dir',
      tempDir,
      '--role',
      'readonly',
      '--node-name',
      'offline-node',
    ]);
    await program.parseAsync([
      'node',
      'agentforge',
      'dashboard',
      'token',
      'list',
      '--offline',
      '--data-dir',
      tempDir,
    ]);
  });

  it('publishes and lists capabilities against a running Hub', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cli-cap-'));
    hubServer = await startTestHub();
    const capabilityFile = join(tempDir, 'cap.json');
    await writeFile(
      capabilityFile,
      JSON.stringify({
        id: 'cli-cap',
        type: 'tool',
        name: 'CLI Cap',
        description: 'Published from CLI test',
        endpointType: 'local-function',
        endpoint: { target: 'tools.cli' },
        inputSchema: { type: 'object' },
      }),
      'utf-8'
    );

    const program = new Command();
    registerCapabilityCommand(program);
    await program.parseAsync([
      'node',
      'agentforge',
      'capability',
      'publish',
      capabilityFile,
      '--hub',
      `http://127.0.0.1:${hubServer.port}`,
      '--admin-token',
      hubServer.adminToken,
    ]);
    await program.parseAsync([
      'node',
      'agentforge',
      'capability',
      'list',
      '--hub',
      `http://127.0.0.1:${hubServer.port}`,
      '--admin-token',
      hubServer.adminToken,
    ]);
  });

  it('rejects an empty batch config', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cli-batch-'));
    const file = join(tempDir, 'batch.json');
    await writeFile(file, JSON.stringify({ agents: [] }), 'utf-8');
    const program = new Command();
    registerBatchCommand(program);
    await expect(program.parseAsync(['node', 'agentforge', 'batch', file])).rejects.toThrow(
      /non-empty "agents" array/
    );
  });

  it('creates a token through a running Hub Admin API', async () => {
    hubServer = await startTestHub();
    const program = new Command();
    registerDashboardCommand(program);
    await program.parseAsync([
      'node',
      'agentforge',
      'dashboard',
      'token',
      'create',
      '--hub',
      `http://127.0.0.1:${hubServer.port}`,
      '--admin-token',
      hubServer.adminToken,
      '--role',
      'readonly',
      '--node-name',
      'online-node',
    ]);
    expect(hubServer.hub.tokenStore.list().some((token) => token.role === 'readonly')).toBe(true);
  });

  it('backs up and restores a local Hub database', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cli-backup-'));
    const program = new Command();
    registerDashboardCommand(program);
    await program.parseAsync([
      'node',
      'agentforge',
      'dashboard',
      'token',
      'create',
      '--offline',
      '--data-dir',
      tempDir,
      '--role',
      'admin',
    ]);
    const createdRepo = openHubRepository(join(tempDir, 'hub.sqlite'));
    const createdStore = new TokenStore({ repository: createdRepo });
    await createdStore.load();
    expect(createdStore.list()).toHaveLength(1);
    createdRepo.close();
    const backup = join(tempDir, 'backup.sqlite');
    await program.parseAsync([
      'node',
      'agentforge',
      'dashboard',
      'backup',
      '--data-dir',
      tempDir,
      '--out',
      backup,
    ]);
    const restoredDir = join(tempDir, 'restored');
    await program.parseAsync([
      'node',
      'agentforge',
      'dashboard',
      'restore',
      '--from',
      backup,
      '--data-dir',
      restoredDir,
    ]);
    const repository = openHubRepository(join(restoredDir, 'hub.sqlite'));
    const store = new TokenStore({ repository });
    await store.load();
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.role).toBe('admin');
    repository.close();
  });
});
