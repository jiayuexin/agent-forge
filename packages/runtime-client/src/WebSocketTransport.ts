import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type {
  AgentMessage,
  AgentRuntimeConfig,
  ControlMessage,
  Logger,
  RuntimeClientStatus,
} from '@agentforge/types';
import { CoreError } from '@agentforge/core';

export interface WebSocketTransportOptions {
  nodeId: string;
  hubUrl: string;
  websocketUrl?: string;
  authToken?: string;
  reconnect?: AgentRuntimeConfig['reconnect'];
  logger?: Logger;
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
export interface WebSocketTransport {
  on(event: 'open', listener: () => void): this;
  on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
  on(event: 'message', listener: (message: ControlMessage) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export class WebSocketTransport extends EventEmitter {
  readonly nodeId: string;
  private readonly hubUrl: string;
  private readonly websocketUrl?: string;
  private readonly authToken?: string;
  private readonly reconnect: Required<NonNullable<AgentRuntimeConfig['reconnect']>>;
  private readonly logger: Logger;

  private socket?: WebSocket;
  private _status: RuntimeClientStatus = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private intentionalClose = false;
  private connectPromise?: Promise<void>;
  private connectResolve?: () => void;
  private connectReject?: (error: Error) => void;

  constructor(options: WebSocketTransportOptions) {
    super();
    this.nodeId = options.nodeId;
    this.hubUrl = options.hubUrl;
    this.websocketUrl = options.websocketUrl;
    this.authToken = options.authToken;
    this.reconnect = {
      enabled: options.reconnect?.enabled ?? true,
      maxAttempts: options.reconnect?.maxAttempts ?? 10,
      delayMs: options.reconnect?.delayMs ?? 1000,
      backoffMultiplier: options.reconnect?.backoffMultiplier ?? 2,
    };
    this.logger = options.logger ?? consoleLogger();
  }

  get status(): RuntimeClientStatus {
    return this._status;
  }

  connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.intentionalClose = false;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.doConnect();
    });

    return this.connectPromise;
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnect();
    this.connectPromise = undefined;
    this.connectResolve = undefined;
    this.connectReject = undefined;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.terminate();
      this.socket = undefined;
    }

    this.setStatus('disconnected');
  }

  send(message: AgentMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new CoreError(
        'TRANSPORT_NOT_CONNECTED',
        `TRANSPORT_NOT_CONNECTED: Cannot send message while status is ${this._status}`
      );
    }

    this.socket.send(JSON.stringify(message));
  }

  private doConnect(): void {
    if (this.socket) {
      return;
    }

    this.setStatus('connecting');

    const url = this.buildUrl();
    this.logger.info(`Connecting to Capability Hub: ${url}`);

    try {
      this.socket = new WebSocket(url);
    } catch (error) {
      this.handleConnectionError(error);
      return;
    }

    this.socket.on('open', () => {
      this.reconnectAttempt = 0;
      this.setStatus('connected');
      this.connectResolve?.();
      this.connectResolve = undefined;
      this.connectReject = undefined;
      this.connectPromise = undefined;
      this.emit('open');
    });

    this.socket.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(data);
    });

    this.socket.on('close', (code: number, reason: Buffer) => {
      this.socket = undefined;
      this.setStatus('disconnected');
      this.emit('close', code, reason);

      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (error: Error) => {
      this.logger.error('WebSocket error', error);
      this.emit('error', error);
      this.handleConnectionError(error);
    });
  }

  private handleMessage(data: WebSocket.RawData): void {
    let parsed: unknown;

    try {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      parsed = JSON.parse(text);
    } catch (error) {
      this.emit(
        'error',
        new CoreError('INVALID_MESSAGE', 'Failed to parse incoming WebSocket message', error)
      );
      return;
    }

    const message = parsed as ControlMessage;
    this.emit('message', message);
  }

  private handleConnectionError(error: unknown): void {
    if (this.connectReject) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.connectReject(err);
      this.connectReject = undefined;
      this.connectResolve = undefined;
      this.connectPromise = undefined;
    }

    if (!this.intentionalClose) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.reconnect.enabled) {
      this.setStatus('error');
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempt >= this.reconnect.maxAttempts) {
      this.setStatus('error');
      this.emit(
        'error',
        new CoreError(
          'RECONNECT_EXHAUSTED',
          `Failed to reconnect after ${this.reconnect.maxAttempts} attempts`
        )
      );
      return;
    }

    this.reconnectAttempt += 1;
    const delay =
      this.reconnect.delayMs * Math.pow(this.reconnect.backoffMultiplier, this.reconnectAttempt - 1);

    this.logger.warn(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt}/${this.reconnect.maxAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.doConnect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private setStatus(value: RuntimeClientStatus): void {
    this._status = value;
  }

  private buildUrl(): string {
    const base = this.websocketUrl ?? this.hubUrl.replace(/^http/, 'ws');
    const normalized = base.replace(/\/\/localhost(?=:|\/|$)/, '//127.0.0.1');
    const url = new URL(`/ws/nodes/${this.nodeId}`, normalized);

    if (this.authToken) {
      url.searchParams.set('token', this.authToken);
    }

    return url.toString();
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
