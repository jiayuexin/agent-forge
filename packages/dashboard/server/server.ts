import { createServer, type Server } from 'node:http';
import { toNodeListener } from 'h3';
import { SimpleLogger } from '@agentforge/core';
import { MetricsRegistry } from '@agentforge/http-server';
import type { HubRuntimeConfig, Logger } from '@agentforge/types';
import { createHubApp, type HubAppOptions } from './app.js';
import { NodeRegistry } from './services/NodeRegistry.js';
import { CapabilityStore } from './services/CapabilityStore.js';
import { TokenStore } from './services/TokenStore.js';
import { ClientAgentTemplateStore } from './services/ClientAgentTemplateStore.js';
import { NodeWebSocketServer } from './websocket/NodeWebSocketServer.js';

export { type HubAppOptions };

export interface HubServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  adminToken?: string;
  logger?: Logger;
  metrics?: MetricsRegistry;
}

export interface HubServer {
  server: Server;
  url: string;
  nodeRegistry: NodeRegistry;
  capabilityStore: CapabilityStore;
  tokenStore: TokenStore;
  stop(): Promise<void>;
}

export async function createHubServer(options: HubServerOptions = {}): Promise<HubServer> {
  const logger = options.logger ?? new SimpleLogger({ component: 'HubServer' });
  const dataDir = options.dataDir ?? '.agentforge/hub';
  const metrics = options.metrics ?? new MetricsRegistry();

  const nodeRegistry = new NodeRegistry({ logger: logger.child({ component: 'NodeRegistry' }) });
  const capabilityStore = new CapabilityStore({ dataDir });
  const tokenStore = new TokenStore({ dataDir });
  const templateStore = new ClientAgentTemplateStore();

  await capabilityStore.load();
  await tokenStore.load();

  const runtimeConfig: HubRuntimeConfig = {
    port: options.port ?? 8080,
    host: options.host ?? 'localhost',
    version: '0.0.0',
    logLevel: 'info',
  };

  const app = createHubApp({
    nodeRegistry,
    capabilityStore,
    tokenStore,
    templateStore,
    runtimeConfig,
    metrics,
    logger,
    adminToken: options.adminToken,
  });

  const listener = toNodeListener(app);
  const server = createServer(listener);
  const wsServer = new NodeWebSocketServer({
    nodeRegistry,
    tokenStore,
    logger: logger.child({ component: 'NodeWebSocketServer' }),
  });

  server.on('upgrade', (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head);
  });

  const port = runtimeConfig.port;
  const host = runtimeConfig.host;
  const url = `http://${host}:${port}`;

  return {
    server,
    url,
    nodeRegistry,
    capabilityStore,
    tokenStore,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        wsServer.close().catch(reject);
        nodeRegistry.destroy();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

export async function startHubServer(options: HubServerOptions = {}): Promise<HubServer> {
  const hubServer = await createHubServer(options);
  const port = options.port ?? 8080;
  const host = options.host ?? 'localhost';

  await new Promise<void>((resolve, reject) => {
    hubServer.server.once('error', reject);
    hubServer.server.once('listening', () => {
      hubServer.server.off('error', reject);
      resolve();
    });
    hubServer.server.listen(port, host);
  });

  return hubServer;
}
