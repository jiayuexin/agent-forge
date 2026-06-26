import type { Logger } from '@agentforge/types';
import type { H3Event } from 'h3';

export function logRequest(event: H3Event, logger: Logger): void {
  const start = Date.now();
  const method = event.node.req.method ?? 'UNKNOWN';
  const url = event.node.req.url ?? '/';

  event.node.res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${method} ${url} ${event.node.res.statusCode} ${duration}ms`);
  });
}
