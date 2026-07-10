import { createServer, type Server } from 'node:http';
import { createApp, eventHandler, type H3Event } from 'h3';
import { toNodeListener } from 'h3';
import { handleError } from '@agentforge/http-server';

export interface RouteServer {
  server: Server;
  url: string;
  stop(): Promise<void>;
}

export async function startRouteServer(
  handler: Parameters<(typeof createApp)['use']>[1],
  mountPath = '/'
): Promise<RouteServer> {
  const app = createApp({
    onError: (error, event) => handleError(error, event as H3Event),
  });
  app.use(mountPath, eventHandler(handler));

  const server = createServer(toNodeListener(app));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => {
      server.off('error', reject);
      resolve();
    });
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    server,
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
