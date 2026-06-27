import type { WebSocket, RawData } from 'ws';
import type { AgentMessage, AgentNode, Logger } from '@agentforge/types';
import type { TokenStore } from './TokenStore.js';

export interface DashboardEvent {
  type: 'node-registered' | 'node-disconnected' | 'agent-message';
  nodeId: string;
  node?: AgentNode;
  message?: AgentMessage;
  timestamp: number;
}

export interface DashboardEventBroadcasterOptions {
  tokenStore: TokenStore;
  adminToken?: string;
  logger?: Logger;
}

export class DashboardEventBroadcaster {
  private connections = new Set<WebSocket>();
  private tokenStore: TokenStore;
  private adminToken?: string;
  private logger: Logger;

  constructor(options: DashboardEventBroadcasterOptions) {
    this.tokenStore = options.tokenStore;
    this.adminToken = options.adminToken;
    this.logger = options.logger ?? consoleLogger();
  }

  handleConnection(ws: WebSocket, token: string): void {
    if (!this.isAuthorized(token)) {
      this.logger.warn('Rejecting dashboard connection: invalid token');
      ws.close(1008, 'Invalid token');
      return;
    }

    this.connections.add(ws);
    this.logger.info('Dashboard client connected');

    ws.on('message', (data: RawData) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', () => {
      this.connections.delete(ws);
      this.logger.info('Dashboard client disconnected');
    });

    ws.on('error', (error: Error) => {
      this.connections.delete(ws);
      this.logger.error('Dashboard WebSocket error', error);
    });
  }

  broadcast(event: DashboardEvent): void {
    const payload = JSON.stringify(event);
    for (const ws of this.connections) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const ws of this.connections) {
        ws.terminate();
      }
      this.connections.clear();
      resolve();
    });
  }

  private isAuthorized(token: string): boolean {
    if (this.adminToken && token === this.adminToken) {
      return true;
    }
    const validation = this.tokenStore.validate(token);
    return validation.valid;
  }

  private handleMessage(ws: WebSocket, data: RawData): void {
    try {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      const message = JSON.parse(text) as { type?: string };
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch {
      // Ignore malformed messages
    }
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
