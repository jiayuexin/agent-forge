import { eventHandler } from 'h3';
import type { MetricsRegistry } from '@agentforge/http-server';

export function createMetricsRoute(registry: MetricsRegistry) {
  return eventHandler(() => {
    return registry.output();
  });
}
