import { resolve } from 'node:path';
import { PinoLogger } from './logger.js';
import { startHubServer } from './server.js';
import { startOtelIfConfigured } from './observability.js';

async function main() {
  const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('AGENTFORGE_ADMIN_TOKEN is required to start Capability Hub');
  }

  const port = process.env.AGENTFORGE_PORT ? Number(process.env.AGENTFORGE_PORT) : undefined;
  const host = process.env.AGENTFORGE_HOST;
  const dataDir = process.env.AGENTFORGE_DATA_DIR;
  const staticDir = process.env.AGENTFORGE_DASHBOARD_STATIC_DIR
    ? resolve(process.env.AGENTFORGE_DASHBOARD_STATIC_DIR)
    : resolve(import.meta.dirname ?? __dirname, '../dist/static');

  const logger = new PinoLogger();
  await startOtelIfConfigured(logger);

  const server = await startHubServer({
    port,
    host,
    dataDir,
    adminToken,
    logger,
    staticDir,
  });

  logger.info(`Capability Hub listening at ${server.url}`);

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
}

main().catch((error) => {
  console.error('Failed to start Capability Hub', error);
  process.exit(1);
});
