import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { Logger } from '@agentforge/types';
import type { NodeRegistry } from '../services/NodeRegistry.js';
import type { TokenStore } from '../services/TokenStore.js';
import type { DashboardEventBroadcaster } from '../services/DashboardEventBroadcaster.js';

export interface NodeWebSocketServerOptions {
  nodeRegistry: NodeRegistry;
  tokenStore: TokenStore;
  dashboardBroadcaster?: DashboardEventBroadcaster;
  logger?: Logger;
}

export class NodeWebSocketServer {
  private wss: WebSocketServer;
  private nodeRegistry: NodeRegistry;
  private tokenStore: TokenStore;
  private dashboardBroadcaster?: DashboardEventBroadcaster;
  private logger: Logger;

  constructor(options: NodeWebSocketServerOptions) {
    this.nodeRegistry = options.nodeRegistry;
    this.tokenStore = options.tokenStore;
    this.dashboardBroadcaster = options.dashboardBroadcaster;
    this.logger = options.logger ?? consoleLogger();
    this.wss = new WebSocketServer({ noServer: true });
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    try {
      const { pathname, searchParams } = this.parseUrl(request);
      const token = searchParams.get('token') ?? '';

      if (pathname === '/ws/events') {
        this.handleDashboardUpgrade(request, socket, head, token);
        return;
      }

      const match = pathname.match(/^\/ws\/nodes\/([^/]+)$/);
      if (!match) {
        this.destroySocket(socket, 'Invalid WebSocket path');
        return;
      }

      const nodeId = decodeURIComponent(match[1]);
      const validation = this.tokenStore.validate(token, { nodeId });

      if (!validation.valid) {
        this.destroySocket(socket, 'Invalid token');
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleNodeConnection(ws, nodeId);
      });
    } catch (error) {
      this.logger.error('WebSocket upgrade error', error);
      this.destroySocket(socket, 'Upgrade error');
    }
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private handleDashboardUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    token: string
  ): void {
    if (!this.dashboardBroadcaster) {
      this.destroySocket(socket, 'Dashboard events not enabled');
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.dashboardBroadcaster!.handleConnection(ws, token);
    });
  }

  private handleNodeConnection(ws: WebSocket, nodeId: string): void {
    this.nodeRegistry.register(nodeId, ws, { name: nodeId });
  }

  private parseUrl(request: IncomingMessage): { pathname: string; searchParams: URLSearchParams } {
    const url = new URL(request.url ?? '/', 'http://localhost');
    return { pathname: url.pathname, searchParams: url.searchParams };
  }

  private destroySocket(socket: Duplex, message: string): void {
    this.logger.warn(`Rejecting WebSocket upgrade: ${message}`);
    socket.destroy();
  }
}

function consoleLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => consoleLogger(),
  };
}
