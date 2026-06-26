import type { AgentMessage, Logger } from '@agentforge/types';
import type { WebSocketTransport } from './WebSocketTransport.js';

export interface HeartbeatManagerOptions {
  intervalMs?: number;
  logger?: Logger;
  produce: () => AgentMessage;
}

export class HeartbeatManager {
  private readonly transport: WebSocketTransport;
  private readonly intervalMs: number;
  private readonly logger: Logger;
  private readonly produce: () => AgentMessage;

  private timer?: ReturnType<typeof setInterval>;
  private started = false;

  constructor(transport: WebSocketTransport, options: HeartbeatManagerOptions) {
    this.transport = transport;
    this.intervalMs = options.intervalMs ?? 30000;
    this.produce = options.produce;
    this.logger = options.logger ?? consoleLogger();

    this.transport.on('open', () => {
      if (this.started) {
        this.send();
      }
    });

    this.transport.on('close', () => {
      this.clear();
    });
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.send();
    this.timer = setInterval(() => this.send(), this.intervalMs);
  }

  stop(): void {
    this.started = false;
    this.clear();
  }

  private send(): void {
    if (this.transport.status !== 'connected') {
      return;
    }

    try {
      this.transport.send(this.produce());
    } catch (error) {
      this.logger.error('Failed to send heartbeat', error);
    }
  }

  private clear(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
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
