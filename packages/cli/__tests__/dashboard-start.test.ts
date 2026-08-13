import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { startHubServer } from '@agentforge/dashboard';
import { registerDashboardCommand } from '../src/commands/dashboard.js';

vi.mock('@agentforge/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agentforge/dashboard')>();
  return {
    ...actual,
    startHubServer: vi.fn(),
  };
});

describe('CLI dashboard start flags', () => {
  const originalToken = process.env.AGENTFORGE_ADMIN_TOKEN;

  beforeEach(() => {
    process.env.AGENTFORGE_ADMIN_TOKEN = 'test-admin';
    vi.mocked(startHubServer).mockReset();
    vi.mocked(startHubServer).mockResolvedValue({
      url: 'http://127.0.0.1:18080',
      stop: vi.fn(),
    } as never);
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.AGENTFORGE_ADMIN_TOKEN;
    } else {
      process.env.AGENTFORGE_ADMIN_TOKEN = originalToken;
    }
  });

  it('forwards --port/--host/--data-dir when start is implied', async () => {
    const program = new Command();
    registerDashboardCommand(program);
    await program.parseAsync([
      'node',
      'agentforge',
      'dashboard',
      '--port',
      '18080',
      '--host',
      '0.0.0.0',
      '--data-dir',
      '/tmp/hub-data',
    ]);

    expect(startHubServer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 18080,
        host: '0.0.0.0',
        dataDir: '/tmp/hub-data',
        adminToken: 'test-admin',
      })
    );
  });
});
