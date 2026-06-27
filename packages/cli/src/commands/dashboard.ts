import { resolve } from 'node:path';
import type { Command } from 'commander';
import { SimpleLogger } from '@agentforge/core';
import { startHubServer, TokenStore } from '@agentforge/dashboard';

function resolveStaticDir(): string {
  if (process.env.AGENTFORGE_DASHBOARD_STATIC_DIR) {
    return resolve(process.env.AGENTFORGE_DASHBOARD_STATIC_DIR);
  }
  return resolve(process.cwd(), 'packages/dashboard/dist/static');
}

export function registerDashboardCommand(program: Command): void {
  const dashboard = program
    .command('dashboard')
    .description('Start Capability Hub or manage node tokens')
    .option('--port <port>', 'Port', process.env.AGENTFORGE_PORT ?? '8080')
    .option('--host <host>', 'Host', process.env.AGENTFORGE_HOST ?? 'localhost')
    .option('--data-dir <dir>', 'Hub data directory', process.env.AGENTFORGE_DATA_DIR ?? '.agentforge/hub')
    .action(async (options) => {
      const logger = new SimpleLogger({ component: 'HubServerCLI' });
      const server = await startHubServer({
        port: Number(options.port),
        host: options.host,
        dataDir: options.dataDir,
        adminToken: process.env.AGENTFORGE_ADMIN_TOKEN,
        logger,
        staticDir: resolveStaticDir(),
      });

      console.log(`Capability Hub listening at ${server.url}`);

      const shutdown = async () => {
        await server.stop();
        process.exit(0);
      };

      process.on('SIGINT', () => {
        void shutdown();
      });
      process.on('SIGTERM', () => {
        void shutdown();
      });
    });

  const token = dashboard.command('token').description('Manage node authentication tokens');

  token
    .command('create')
    .description('Create a node authentication token')
    .option('--node-name <name>', 'Node name used to derive nodeId')
    .option('--expires-in <hours>', 'Token validity in hours', '720')
    .option('--data-dir <dir>', 'Hub data directory', '.agentforge/hub')
    .action(async (options) => {
      const store = new TokenStore({ dataDir: options.dataDir });
      await store.load();
      const response = store.create({
        nodeName: options.nodeName,
        expiresInHours: Number(options.expiresIn),
      });
      await store.save();
      console.log(JSON.stringify(response, null, 2));
    });

  token
    .command('revoke')
    .description('Revoke a node authentication token')
    .argument('<token-id>', 'Token id to revoke')
    .option('--data-dir <dir>', 'Hub data directory', '.agentforge/hub')
    .action(async (tokenId: string, options) => {
      const store = new TokenStore({ dataDir: options.dataDir });
      await store.load();
      await store.revoke(tokenId);
      await store.save();
      console.log(`Revoked token ${tokenId}`);
    });

  token
    .command('list')
    .description('List node authentication tokens')
    .option('--data-dir <dir>', 'Hub data directory', '.agentforge/hub')
    .action(async (options) => {
      const store = new TokenStore({ dataDir: options.dataDir });
      await store.load();
      console.log(JSON.stringify(store.list(), null, 2));
    });
}
