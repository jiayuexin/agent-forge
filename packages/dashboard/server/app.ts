import { createApp, createRouter, eventHandler, setHeader, type H3Event } from 'h3';
import { SimpleLogger } from '@agentforge/core';
import { MetricsRegistry, handleError, logRequest } from '@agentforge/http-server';
import type { HubRuntimeConfig, Logger } from '@agentforge/types';
import type { NodeRegistry } from './services/NodeRegistry.js';
import type { CapabilityStore } from './services/CapabilityStore.js';
import type { TokenStore } from './services/TokenStore.js';
import type { ClientAgentTemplateStore } from './services/ClientAgentTemplateStore.js';
import type { GeneratedClientAgentStore } from './services/GeneratedClientAgentStore.js';
import { createAuthMiddleware, requireAdmin } from './middleware/auth.js';
import { createHealthRoute } from './routes/health.js';
import { createMetricsRoute } from './routes/metrics.js';
import { createConfigRoute } from './routes/config.js';
import { createNodesRoute } from './routes/nodes.js';
import { createCapabilitiesRoute } from './routes/capabilities.js';
import { createAdminTokensRoute } from './routes/admin-tokens.js';
import { createClientAgentTemplatesRoute } from './routes/client-agent-templates.js';
import { createClientAgentsRoute } from './routes/client-agents.js';
import { createAuditRoute } from './routes/audit.js';
import { createOpenApiRoute } from './routes/openapi.js';
import { createStaticHandler } from './static.js';
import type { RepositoryAuditLog } from './storage/RepositoryAuditLog.js';

export const API_V1_PREFIX = '/api/v1';

export interface HubAppOptions {
  nodeRegistry: NodeRegistry;
  capabilityStore: CapabilityStore;
  tokenStore: TokenStore;
  templateStore: ClientAgentTemplateStore;
  generatedAgentStore: GeneratedClientAgentStore;
  auditLog: RepositoryAuditLog;
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
  const authFailures = metrics.counter('hub_auth_failures_total', 'Hub authentication failures');
  metrics.counter('hub_tasks_unknown_total', 'Remote tasks that timed out with unknown outcome');
  metrics.counter('hub_db_errors_total', 'Hub database errors');
  metrics.counter('hub_node_reconnects_total', 'ClientAgent node reconnects');
  const duration = metrics.histogram('hub_http_request_duration_ms', 'Hub HTTP request duration');

  const app = createApp({
    onRequest: eventHandler((event: H3Event) => {
      requestCounter.inc({ method: event.method ?? 'GET' });
      nodeGauge.set({}, options.nodeRegistry.list().length);
      logRequest(event, logger);
      event.context.requestStartedAt = Date.now();
      if (
        event.path.startsWith('/api/') &&
        !event.path.startsWith(`${API_V1_PREFIX}/`) &&
        event.path !== '/api/health'
      ) {
        setHeader(event, 'Deprecation', 'true');
        setHeader(event, 'Link', `</api/v1>; rel="successor-version"`);
      }
    }),
    onBeforeResponse: eventHandler((event: H3Event) => {
      const startedAt = event.context.requestStartedAt;
      if (typeof startedAt === 'number') {
        duration.observe({ method: event.method ?? 'GET' }, Date.now() - startedAt);
      }
    }),
    onError: (error, event) => handleError(error, event as H3Event),
  });

  const authMiddleware = eventHandler(
    createAuthMiddleware(options.tokenStore, options.adminToken, () => authFailures.inc())
  );
  const adminOnlyMetrics = eventHandler((event: H3Event) => {
    createAuthMiddleware(options.tokenStore, options.adminToken, () => authFailures.inc())(event);
    requireAdmin(event);
  });

  mountApiSurface(app, API_V1_PREFIX, options, authMiddleware, adminOnlyMetrics, metrics);
  mountApiSurface(app, '/api', options, authMiddleware, adminOnlyMetrics, metrics);

  const staticDir = options.staticDir ?? './dist/static';
  app.use(createStaticHandler({ staticDir }));

  return app;
}

function mountApiSurface(
  app: ReturnType<typeof createApp>,
  prefix: string,
  options: HubAppOptions,
  authMiddleware: ReturnType<typeof eventHandler>,
  adminOnlyMetrics: ReturnType<typeof eventHandler>,
  metrics: MetricsRegistry
): void {
  const publicRouter = createRouter();
  publicRouter.get(`${prefix}/health`, createHealthRoute());
  publicRouter.get(`${prefix}/openapi.json`, createOpenApiRoute(options.runtimeConfig));
  app.use(publicRouter);

  app.use(`${prefix}/metrics`, adminOnlyMetrics);
  app.use(`${prefix}/metrics`, eventHandler(createMetricsRoute(metrics)));
  app.use(`${prefix}/config`, authMiddleware);
  app.use(`${prefix}/config`, eventHandler(createConfigRoute(options.runtimeConfig)));
  app.use(`${prefix}/nodes`, authMiddleware);
  app.use(
    `${prefix}/nodes`,
    eventHandler(createNodesRoute(options.nodeRegistry, options.auditLog))
  );
  app.use(`${prefix}/capabilities`, authMiddleware);
  app.use(
    `${prefix}/capabilities`,
    eventHandler(
      createCapabilitiesRoute(options.capabilityStore, options.nodeRegistry, options.auditLog)
    )
  );
  app.use(`${prefix}/admin/tokens`, authMiddleware);
  app.use(`${prefix}/admin/tokens`, eventHandler(createAdminTokensRoute(options.tokenStore)));
  app.use(`${prefix}/client-agent-templates`, authMiddleware);
  app.use(
    `${prefix}/client-agent-templates`,
    eventHandler(createClientAgentTemplatesRoute(options.templateStore))
  );
  app.use(`${prefix}/client-agents`, authMiddleware);
  app.use(
    `${prefix}/client-agents`,
    eventHandler(createClientAgentsRoute(options.generatedAgentStore))
  );
  app.use(`${prefix}/audit`, authMiddleware);
  app.use(`${prefix}/audit`, eventHandler(createAuditRoute(options.auditLog)));
}
