import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Command } from 'commander';
import {
  ClientAgent,
  MockProvider,
  ProviderFactory,
  verifyGeneratedTypeScript,
} from '@agentforge/core';
import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { registerCreateCommand } from '../src/commands/create.js';
import { startTestHub } from '../../dashboard/__tests__/helpers.js';

describe('CLI create command', () => {
  let outputDir: string;
  let hubServer: Awaited<ReturnType<typeof startTestHub>> | undefined;

  afterEach(async () => {
    if (hubServer) {
      await hubServer.hub.stop();
    }
    if (outputDir) {
      await rm(dirname(outputDir), { recursive: true, force: true });
    }
  });

  it('creates a ClientAgent, verifies files, then executes through Hub', async () => {
    outputDir = join(await mkdtemp(join(tmpdir(), 'cli-create-')), 'agent');
    const program = new Command();
    registerCreateCommand(program);
    await program.parseAsync([
      'node',
      'agentforge',
      'create',
      'A local command helper that can list files',
      '--name',
      'cli-create-agent',
      '--output',
      outputDir,
    ]);

    const pkg = JSON.parse(await readFile(join(outputDir, 'package.json'), 'utf-8')) as {
      name: string;
    };
    expect(pkg.name).toBe('cli-create-agent');
    await expect(readFile(join(outputDir, 'src/agent.ts'), 'utf-8')).resolves.toContain(
      'ClientAgent'
    );
    await expect(readFile(join(outputDir, 'src/tools.ts'), 'utf-8')).resolves.toContain(
      'git-status'
    );
    await expect(readFile(join(outputDir, 'tsconfig.json'), 'utf-8')).resolves.toContain('outDir');

    const generatedFiles: Record<string, string> = {};
    for (const relative of await listGeneratedFiles(outputDir)) {
      generatedFiles[relative] = await readFile(join(outputDir, relative), 'utf-8');
    }
    expect(() => verifyGeneratedTypeScript(generatedFiles)).not.toThrow();

    hubServer = await startTestHub();
    const token = hubServer.hub.tokenStore.create({ nodeName: 'cli-create-agent' });
    if (!ProviderFactory.list().includes('mock')) {
      ProviderFactory.register('mock', MockProvider);
    }
    const agent = new ClientAgent({
      identity: { id: token.nodeId, name: 'cli-create-agent', role: 'assistant', version: '0.0.1' },
      model: { provider: 'mock', modelName: 'mock-model' },
      systemPrompt: 'CLI create integration agent',
    });
    const runtime = new AgentRuntimeClient(agent, {
      hubUrl: `http://127.0.0.1:${hubServer.port}`,
      websocketUrl: `ws://127.0.0.1:${hubServer.port}`,
      authToken: token.token,
      allowRemoteExecution: true,
      heartbeatInterval: 1000,
    });
    await runtime.start();
    try {
      const result = await fetch(
        `http://127.0.0.1:${hubServer.port}/api/v1/nodes/${token.nodeId}/execute`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hubServer.adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type: 'chat', input: { message: 'hello-from-cli' } }),
        }
      );
      expect(result.ok).toBe(true);
      await expect(result.json()).resolves.toMatchObject({
        success: true,
        output: { content: expect.stringContaining('hello-from-cli') },
      });
    } finally {
      await runtime.stop();
    }
  });
});

async function listGeneratedFiles(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listGeneratedFiles(root, relative)));
    } else {
      files.push(relative);
    }
  }
  return files;
}
