import { resolve } from 'node:path';
import { SimpleLogger } from '@agentforge/core';
import { startHubServer } from './server.js';

async function main() {
  const port = process.env.AGENTFORGE_PORT ? Number(process.env.AGENTFORGE_PORT) : undefined;
  const host = process.env.AGENTFORGE_HOST;
  const dataDir = process.env.AGENTFORGE_DATA_DIR;
  const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN;
  const staticDir = process.env.AGENTFORGE_DASHBOARD_STATIC_DIR
    ? resolve(process.env.AGENTFORGE_DASHBOARD_STATIC_DIR)
    : resolve(import.meta.dirname ?? __dirname, '../dist/static');
  const logLevel = process.env.AGENTFORGE_LOG_LEVEL ?? 'info';

  const logger = new SimpleLogger({ component: 'HubServer', level: logLevel });

  const server = await startHubServer({
    port,
    host,
    dataDir,
    adminToken,
    logger,
    staticDir,
  });

  logger.info(`Capability Hub listening at ${server.url}`);
}

main().catch((error) => {
  console.error('Failed to start Capability Hub', error);
  process.exit(1);
});
