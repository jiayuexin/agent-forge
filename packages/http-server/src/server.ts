import { createServer, type Server } from 'node:http';
import { toNodeListener } from 'h3';
import { SimpleLogger } from '@agentforge/core';
import type { IAgent, Logger } from '@agentforge/types';
import { createBaseApp } from './app.js';
import { MetricsRegistry } from './metrics/MetricsRegistry.js';

export interface DebugServerOptions {
  port?: number;
  host?: string;
  logger?: Logger;
  metrics?: MetricsRegistry;
}

export interface DebugServer {
  server: Server;
  url: string;
  stop(): Promise<void>;
}

export function createDebugServer(agent: IAgent, options: DebugServerOptions = {}): DebugServer {
  const logger = options.logger ?? new SimpleLogger({ component: 'DebugServer' });
  const metrics = options.metrics ?? new MetricsRegistry();
  const app = createBaseApp({ agent, metrics, logger });

  const listener = toNodeListener(app);
  const server = createServer(listener);

  const port = options.port ?? 3001;
  const host = options.host ?? 'localhost';
  const url = `http://${host}:${port}`;

  return {
    server,
    url,
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

export async function startDebugServer(
  agent: IAgent,
  options: DebugServerOptions = {}
): Promise<DebugServer> {
  const server = createDebugServer(agent, options);
  const port = options.port ?? 3001;
  const host = options.host ?? 'localhost';

  await new Promise<void>((resolve, reject) => {
    server.server.once('error', reject);
    server.server.once('listening', () => {
      server.server.off('error', reject);
      resolve();
    });
    server.server.listen(port, host);
  });

  return server;
}
