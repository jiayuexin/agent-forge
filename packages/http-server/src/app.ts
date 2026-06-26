import { createApp, createRouter, eventHandler, type H3Event } from 'h3';
import type { IAgent, Logger } from '@agentforge/types';
import type { MetricsRegistry } from './metrics/MetricsRegistry.js';
import { handleError } from './middleware/error.js';
import { logRequest } from './middleware/logger.js';
import { createHealthRoute } from './routes/health.js';
import { createMetricsRoute } from './routes/metrics.js';
import { createStatusRoute } from './routes/status.js';
import { createCapabilitiesRoute } from './routes/capabilities.js';
import { createExecuteRoute } from './routes/execute.js';
import { createStreamRoute } from './routes/stream.js';

export interface BaseAppOptions {
  agent: IAgent;
  metrics: MetricsRegistry;
  logger: Logger;
  prefix?: string;
}

export function createBaseApp(options: BaseAppOptions) {
  const { agent, metrics, logger, prefix = '/api' } = options;

  const app = createApp({
    onRequest: eventHandler((event) => {
      logRequest(event, logger);
    }),
    onError: (error, event) => {
      const response = handleError(error, event as H3Event);
      return response;
    },
  });

  const router = createRouter();

  router.get(`${prefix}/health`, createHealthRoute());
  router.get(`${prefix}/metrics`, createMetricsRoute(metrics));
  router.get(`${prefix}/status`, createStatusRoute(agent));
  router.get(`${prefix}/capabilities`, createCapabilitiesRoute(agent));
  router.post(`${prefix}/execute`, createExecuteRoute(agent));
  router.post(`${prefix}/stream`, createStreamRoute(agent));

  app.use(router);
  return app;
}
