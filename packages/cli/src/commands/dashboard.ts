import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Command } from 'commander';
import type { HubTokenRole } from '@agentforge/types';
import { startHubServer, openHubRepository, TokenStore, PinoLogger } from '@agentforge/dashboard';
import { HubClient, resolveHubBaseUrl } from '../lib/hub-client.js';

const TOKEN_ROLES: HubTokenRole[] = ['admin', 'node', 'readonly'];
const DEFAULT_DATA_DIR = process.env.AGENTFORGE_DATA_DIR ?? '.agentforge/hub';

function parseTokenRole(value: string): HubTokenRole {
  if (!TOKEN_ROLES.includes(value as HubTokenRole)) {
    throw new Error(`Invalid token role "${value}". Expected admin, node, or readonly`);
  }
  return value as HubTokenRole;
}

function resolveStaticDir(): string {
  if (process.env.AGENTFORGE_DASHBOARD_STATIC_DIR) {
    return resolve(process.env.AGENTFORGE_DASHBOARD_STATIC_DIR);
  }
  return resolve(process.cwd(), 'packages/dashboard/dist/static');
}

export function registerDashboardCommand(program: Command): void {
  const dashboard = program
    .command('dashboard')
    .description('Start Capability Hub or manage node tokens');
  dashboard.enablePositionalOptions();

  dashboard
    .command('start', { isDefault: true, hidden: true })
    .description('Start Capability Hub')
    .option('--port <port>', 'Port', process.env.AGENTFORGE_PORT ?? '8080')
    .option('--host <host>', 'Host', process.env.AGENTFORGE_HOST ?? 'localhost')
    .option('--data-dir <dir>', 'Hub data directory', DEFAULT_DATA_DIR)
    .action(async (options) => {
      const logger = new PinoLogger();
      const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN;
      if (!adminToken) {
        throw new Error('AGENTFORGE_ADMIN_TOKEN is required to start Capability Hub');
      }
      const server = await startHubServer({
        port: Number(options.port),
        host: options.host,
        dataDir: options.dataDir,
        adminToken,
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

  dashboard
    .command('backup')
    .description('Backup the Hub SQLite database')
    .requiredOption('--out <path>', 'Destination sqlite file')
    .option('--data-dir <dir>', 'Hub data directory', DEFAULT_DATA_DIR)
    .action(async (options) => {
      const repository = openHubRepository(resolve(options.dataDir, 'hub.sqlite'));
      await repository.backup(resolve(options.out));
      repository.close();
      console.log(`Wrote Hub backup to ${options.out}`);
    });

  dashboard
    .command('restore')
    .description('Restore the Hub SQLite database from a backup file')
    .requiredOption('--from <path>', 'Backup sqlite file')
    .option('--data-dir <dir>', 'Hub data directory', DEFAULT_DATA_DIR)
    .action(async (options) => {
      const destination = resolve(options.dataDir, 'hub.sqlite');
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(options.from), destination);
      console.log(`Restored Hub database to ${destination}`);
    });

  const token = dashboard.command('token').description('Manage node authentication tokens');
  token.enablePositionalOptions();

  token
    .command('create')
    .description('Create a node authentication token via a running Hub')
    .option('--node-name <name>', 'Node name used to derive nodeId')
    .option('--role <role>', 'Token role', 'node')
    .option('--expires-in <hours>', 'Token validity in hours', '720')
    .option('--hub <url>', 'Hub base URL', resolveHubBaseUrl())
    .option('--admin-token <token>', 'Admin token', process.env.AGENTFORGE_ADMIN_TOKEN)
    .option('--offline', 'Create against local SQLite without a running Hub')
    .option('--data-dir <dir>', 'Hub data directory', DEFAULT_DATA_DIR)
    .action(async (options) => {
      if (options.offline) {
        const repository = openHubRepository(resolve(options.dataDir, 'hub.sqlite'));
        const store = new TokenStore({ repository });
        await store.load();
        const response = store.create({
          nodeName: options.nodeName,
          role: parseTokenRole(options.role),
          expiresInHours: Number(options.expiresIn),
        });
        await store.save();
        repository.close();
        console.log(JSON.stringify(response, null, 2));
        return;
      }
      if (!options.adminToken) {
        throw new Error('Admin token is required via --admin-token or AGENTFORGE_ADMIN_TOKEN');
      }
      const client = new HubClient({
        baseUrl: resolveHubBaseUrl(options.hub),
        adminToken: options.adminToken,
      });
      const response = await client.createToken({
        nodeName: options.nodeName,
        role: parseTokenRole(options.role),
        expiresInHours: Number(options.expiresIn),
      });
      console.log(JSON.stringify(response, null, 2));
    });

  token
    .command('revoke')
    .description('Revoke a node authentication token via a running Hub')
    .argument('<token-id>', 'Token id to revoke')
    .option('--hub <url>', 'Hub base URL', resolveHubBaseUrl())
    .option('--admin-token <token>', 'Admin token', process.env.AGENTFORGE_ADMIN_TOKEN)
    .option('--offline', 'Revoke against local SQLite without a running Hub')
    .option('--data-dir <dir>', 'Hub data directory', DEFAULT_DATA_DIR)
    .action(async (tokenId: string, options) => {
      if (options.offline) {
        const repository = openHubRepository(resolve(options.dataDir, 'hub.sqlite'));
        const store = new TokenStore({ repository });
        await store.load();
        await store.revoke(tokenId);
        repository.close();
        console.log(`Revoked token ${tokenId}`);
        return;
      }
      if (!options.adminToken) {
        throw new Error('Admin token is required via --admin-token or AGENTFORGE_ADMIN_TOKEN');
      }
      const client = new HubClient({
        baseUrl: resolveHubBaseUrl(options.hub),
        adminToken: options.adminToken,
      });
      await client.revokeToken(tokenId);
      console.log(`Revoked token ${tokenId}`);
    });

  token
    .command('list')
    .description('List node authentication tokens via a running Hub')
    .option('--hub <url>', 'Hub base URL', resolveHubBaseUrl())
    .option('--admin-token <token>', 'Admin token', process.env.AGENTFORGE_ADMIN_TOKEN)
    .option('--offline', 'List local SQLite tokens without a running Hub')
    .option('--data-dir <dir>', 'Hub data directory', DEFAULT_DATA_DIR)
    .action(async (options) => {
      if (options.offline) {
        const repository = openHubRepository(resolve(options.dataDir, 'hub.sqlite'));
        const store = new TokenStore({ repository });
        await store.load();
        console.log(JSON.stringify(store.list(), null, 2));
        repository.close();
        return;
      }
      if (!options.adminToken) {
        throw new Error('Admin token is required via --admin-token or AGENTFORGE_ADMIN_TOKEN');
      }
      const client = new HubClient({
        baseUrl: resolveHubBaseUrl(options.hub),
        adminToken: options.adminToken,
      });
      console.log(JSON.stringify(await client.listTokens(), null, 2));
    });
}
