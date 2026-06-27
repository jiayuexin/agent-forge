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
import { GeneratedClientAgentStore } from './services/GeneratedClientAgentStore.js';
import { DashboardEventBroadcaster } from './services/DashboardEventBroadcaster.js';
import { NodeWebSocketServer } from './websocket/NodeWebSocketServer.js';
import { resolveTemplatesDir } from './lib/paths.js';

export { type HubAppOptions };

export interface HubServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  adminToken?: string;
  logger?: Logger;
  metrics?: MetricsRegistry;
  staticDir?: string;
}

export interface HubServer {
  server: Server;
  url: string;
  nodeRegistry: NodeRegistry;
  capabilityStore: CapabilityStore;
  tokenStore: TokenStore;
  generatedAgentStore: GeneratedClientAgentStore;
  dashboardBroadcaster?: DashboardEventBroadcaster;
  stop(): Promise<void>;
}

export async function createHubServer(options: HubServerOptions = {}): Promise<HubServer> {
  const logger = options.logger ?? new SimpleLogger({ component: 'HubServer' });
  const dataDir = options.dataDir ?? '.agentforge/hub';
  const metrics = options.metrics ?? new MetricsRegistry();

  const tokenStore = new TokenStore({ dataDir });
  const dashboardBroadcaster = new DashboardEventBroadcaster({
    tokenStore,
    adminToken: options.adminToken,
    logger: logger.child({ component: 'DashboardEventBroadcaster' }),
  });

  const nodeRegistry = new NodeRegistry({
    logger: logger.child({ component: 'NodeRegistry' }),
    onEvent: (nodeId, message) => {
      dashboardBroadcaster.broadcast({
        type: 'agent-message',
        nodeId,
        message,
        timestamp: Date.now(),
      });
    },
  });

  const capabilityStore = new CapabilityStore({ dataDir });
  const templateStore = new ClientAgentTemplateStore({ templatesDir: resolveTemplatesDir() });
  const generatedAgentStore = new GeneratedClientAgentStore({ dataDir });

  await capabilityStore.load();
  await tokenStore.load();
  await generatedAgentStore.load();

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
    generatedAgentStore,
    runtimeConfig,
    metrics,
    logger,
    adminToken: options.adminToken,
    staticDir: options.staticDir,
  });

  const listener = toNodeListener(app);
  const server = createServer(listener);
  const wsServer = new NodeWebSocketServer({
    nodeRegistry,
    tokenStore,
    dashboardBroadcaster,
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
    generatedAgentStore,
    dashboardBroadcaster,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        dashboardBroadcaster.close().catch(reject);
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
