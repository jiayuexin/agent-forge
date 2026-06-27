import { createApp, createRouter, eventHandler, type H3Event } from 'h3';
import { SimpleLogger } from '@agentforge/core';
import { MetricsRegistry, handleError, logRequest } from '@agentforge/http-server';
import type { HubRuntimeConfig, Logger } from '@agentforge/types';
import type { NodeRegistry } from './services/NodeRegistry.js';
import type { CapabilityStore } from './services/CapabilityStore.js';
import type { TokenStore } from './services/TokenStore.js';
import type { ClientAgentTemplateStore } from './services/ClientAgentTemplateStore.js';
import type { GeneratedClientAgentStore } from './services/GeneratedClientAgentStore.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createHealthRoute } from './routes/health.js';
import { createMetricsRoute } from './routes/metrics.js';
import { createConfigRoute } from './routes/config.js';
import { createNodesRoute } from './routes/nodes.js';
import { createCapabilitiesRoute } from './routes/capabilities.js';
import { createAdminTokensRoute } from './routes/admin-tokens.js';
import { createClientAgentTemplatesRoute } from './routes/client-agent-templates.js';
import { createClientAgentsRoute } from './routes/client-agents.js';
import { createStaticHandler } from './static.js';

export interface HubAppOptions {
  nodeRegistry: NodeRegistry;
  capabilityStore: CapabilityStore;
  tokenStore: TokenStore;
  templateStore: ClientAgentTemplateStore;
  generatedAgentStore: GeneratedClientAgentStore;
  runtimeConfig: HubRuntimeConfig;
  metrics?: MetricsRegistry;
  logger?: Logger;
  adminToken?: string;
  staticDir?: string;
}

export function createHubApp(options: HubAppOptions) {
  const logger = options.logger ?? new SimpleLogger({ component: 'HubServer' });
  const metrics = options.metrics ?? new MetricsRegistry();

  const requestCounter = metrics.counter('hub_http_requests_total', 'Total Hub HTTP requests');
  const nodeGauge = metrics.gauge('hub_connected_nodes', 'Connected ClientAgent nodes');

  const app = createApp({
    onRequest: eventHandler((event: H3Event) => {
      requestCounter.inc({ method: event.method ?? 'GET' });
      nodeGauge.set({}, options.nodeRegistry.list().length);
      logRequest(event, logger);
    }),
    onError: (error, event) => handleError(error, event as H3Event),
  });

  const publicRouter = createRouter();
  publicRouter.get('/api/health', createHealthRoute());
  publicRouter.get('/api/metrics', createMetricsRoute(metrics));

  const authMiddleware = eventHandler(createAuthMiddleware(options.tokenStore, options.adminToken));

  app.use(publicRouter);
  app.use('/api/config', authMiddleware);
  app.use('/api/config', eventHandler(createConfigRoute(options.runtimeConfig)));
  app.use('/api/nodes', authMiddleware);
  app.use('/api/nodes', eventHandler(createNodesRoute(options.nodeRegistry)));
  app.use('/api/capabilities', authMiddleware);
  app.use('/api/capabilities', eventHandler(createCapabilitiesRoute(options.capabilityStore, options.nodeRegistry)));
  app.use('/api/admin/tokens', authMiddleware);
  app.use('/api/admin/tokens', eventHandler(createAdminTokensRoute(options.tokenStore)));
  app.use('/api/client-agent-templates', authMiddleware);
  app.use('/api/client-agent-templates', eventHandler(createClientAgentTemplatesRoute(options.templateStore)));
  app.use('/api/client-agents', authMiddleware);
  app.use('/api/client-agents', eventHandler(createClientAgentsRoute(options.generatedAgentStore)));

  const staticDir = options.staticDir ?? './dist/static';
  app.use(createStaticHandler({ staticDir }));

  return app;
}
