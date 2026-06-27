import type WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import type {
  AgentMessage,
  AgentNode,
  AgentNodeStatus,
  AgentResult,
  AgentRuntimeConfig,
  AgentStreamChunk,
  CapabilityAckPayload,
  CapabilityDistributePayload,
  ControlMessage,
  Logger,
  RemoteTask,
} from '@agentforge/types';
import { createHttpError } from '@agentforge/http-server';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface StreamQueue {
  chunks: AgentStreamChunk[];
  resolvers: Array<() => void>;
  done: boolean;
  error?: Error;
}

export type NodeSessionEventListener = (nodeId: string, message: AgentMessage) => void;

export interface NodeSessionOptions {
  nodeId: string;
  name?: string;
  agentId?: string;
  tags?: string[];
  capabilities?: AgentNode['capabilities'];
  hostInfo?: AgentNode['hostInfo'];
  logger?: Logger;
  onEvent?: NodeSessionEventListener;
}

export class NodeSession {
  readonly node: AgentNode;
  private ws: WebSocket;
  private logger: Logger;
  private pending = new Map<string, PendingRequest>();
  private streams = new Map<string, StreamQueue>();
  private messageCounter = 0;
  private onEvent?: NodeSessionEventListener;

  constructor(ws: WebSocket, options: NodeSessionOptions) {
    this.ws = ws;
    const now = Date.now();
    this.node = {
      id: options.nodeId,
      name: options.name ?? options.nodeId,
      agentId: options.agentId ?? options.nodeId,
      status: 'online',
      tags: options.tags ?? [],
      capabilities: options.capabilities ?? [],
      registeredAt: now,
      lastHeartbeat: now,
      metrics: null,
      hostInfo: options.hostInfo,
      connection: {
        protocol: 'websocket',
        connectedAt: now,
        lastPingAt: now,
      },
    };
    this.logger = options.logger ?? consoleLogger();
    this.onEvent = options.onEvent;
  }

  send(message: ControlMessage): void {
    if (this.ws.readyState !== this.ws.OPEN) {
      throw createHttpError('NODE_DISCONNECTED', `Node ${this.node.id} is not connected`, 503);
    }
    this.ws.send(JSON.stringify(message));
  }

  execute(task: RemoteTask, timeoutMs = 30000): Promise<AgentResult> {
    const messageId = this.nextMessageId();
    const message: ControlMessage = {
      type: 'execute',
      messageId,
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: task,
    };
    return this.request(messageId, message, timeoutMs) as Promise<AgentResult>;
  }

  async *stream(task: RemoteTask, timeoutMs = 30000): AsyncIterable<AgentStreamChunk> {
    const messageId = this.nextMessageId();
    const message: ControlMessage = {
      type: 'stream',
      messageId,
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: task,
    };

    const queue: StreamQueue = { chunks: [], resolvers: [], done: false };
    this.streams.set(messageId, queue);

    const timeout = setTimeout(() => {
      queue.done = true;
      queue.error = new Error(`Stream ${messageId} timed out after ${timeoutMs}ms`);
      this.resolveStreamWaiters(queue);
    }, timeoutMs);

    this.send(message);

    try {
      while (true) {
        while (queue.chunks.length === 0 && !queue.done) {
          await this.waitForStreamChunk(queue);
        }

        if (queue.error) {
          throw queue.error;
        }

        if (queue.chunks.length === 0 && queue.done) {
          return;
        }

        const chunk = queue.chunks.shift()!;
        yield chunk;

        if (chunk.type === 'done' || chunk.type === 'error') {
          return;
        }
      }
    } finally {
      clearTimeout(timeout);
      this.streams.delete(messageId);
    }
  }

  distribute(payload: CapabilityDistributePayload, timeoutMs = 30000): Promise<CapabilityAckPayload> {
    const messageId = this.nextMessageId();
    const message: ControlMessage = {
      type: 'capability-distribute',
      messageId,
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload,
    };
    return this.request(messageId, message, timeoutMs) as Promise<CapabilityAckPayload>;
  }

  updateConfig(config: Partial<AgentRuntimeConfig>, timeoutMs = 30000): Promise<void> {
    const messageId = this.nextMessageId();
    const message: ControlMessage = {
      type: 'config-update',
      messageId,
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: config,
    };
    return this.request(messageId, message, timeoutMs) as Promise<void>;
  }

  ping(): void {
    const message: ControlMessage = {
      type: 'ping',
      messageId: this.nextMessageId(),
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: {},
    };
    this.send(message);
  }

  stop(): void {
    const message: ControlMessage = {
      type: 'stop',
      messageId: this.nextMessageId(),
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: {},
    };
    this.send(message);
  }

  handleMessage(message: AgentMessage): void {
    this.onEvent?.(this.node.id, message);

    switch (message.type) {
      case 'pong':
        this.node.connection!.lastPingAt = Date.now();
        return;
      case 'status':
        this.node.status = message.payload as AgentNodeStatus;
        this.node.lastHeartbeat = Date.now();
        return;
      case 'metric':
        this.node.metrics = message.payload as AgentNode['metrics'];
        this.node.lastHeartbeat = Date.now();
        return;
      case 'event': {
        this.node.lastHeartbeat = Date.now();
        const payload = message.payload as { event?: string; node?: Partial<AgentNode> };
        if (payload.event === 'node:register' && payload.node) {
          if (payload.node.name) {
            this.node.name = payload.node.name;
          }
          if (payload.node.agentId) {
            this.node.agentId = payload.node.agentId;
          }
          if (payload.node.tags) {
            this.node.tags = payload.node.tags;
          }
          if (payload.node.capabilities) {
            this.node.capabilities = payload.node.capabilities;
          }
          if (payload.node.hostInfo) {
            this.node.hostInfo = payload.node.hostInfo;
          }
        }
        return;
      }
      case 'stream-chunk': {
        const queue = this.streams.get(message.messageId ?? '');
        if (!queue) return;
        queue.chunks.push(message.payload as AgentStreamChunk);
        this.resolveStreamWaiters(queue);
        const chunk = message.payload as AgentStreamChunk;
        if (chunk.type === 'done' || chunk.type === 'error') {
          queue.done = true;
          this.resolveStreamWaiters(queue);
        }
        return;
      }
      case 'result':
      case 'capability-ack':
      case 'error': {
        const pending = this.pending.get(message.messageId ?? '');
        if (!pending) return;
        if (message.type === 'error') {
          const error = message.payload as { code: string; message: string };
          pending.reject(new Error(`${error.code}: ${error.message}`));
        } else {
          pending.resolve(message.payload);
        }
        return;
      }
      case 'local-approval-request':
        // Hub 端暂不做处理，由前端/UI 消费
        return;
      default:
        this.logger.warn(`Unhandled agent message type: ${(message as AgentMessage).type}`);
    }
  }

  close(): void {
    for (const pending of this.pending.values()) {
      pending.reject(createError('NODE_DISCONNECTED', 'Node session closed'));
    }
    this.pending.clear();
    for (const queue of this.streams.values()) {
      queue.done = true;
      queue.error = createError('NODE_DISCONNECTED', 'Node session closed');
      this.resolveStreamWaiters(queue);
    }
    this.streams.clear();
    this.node.status = 'offline';
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.close();
    }
  }

  private request(messageId: string, message: ControlMessage, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(messageId);
        reject(createError('REQUEST_TIMEOUT', `Request ${messageId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(messageId, {
        resolve: (value: unknown) => {
          clearTimeout(timeout);
          this.pending.delete(messageId);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.pending.delete(messageId);
          reject(error);
        },
        timeout,
      });

      this.send(message);
    });
  }

  private waitForStreamChunk(queue: StreamQueue): Promise<void> {
    return new Promise((resolve) => {
      if (queue.chunks.length > 0 || queue.done) {
        resolve();
        return;
      }
      queue.resolvers.push(resolve);
    });
  }

  private resolveStreamWaiters(queue: StreamQueue): void {
    while (queue.resolvers.length > 0) {
      const resolve = queue.resolvers.shift()!;
      resolve();
    }
  }

  private nextMessageId(): string {
    this.messageCounter += 1;
    return `${this.node.id}-${this.messageCounter}-${randomUUID()}`;
  }
}

function createError(code: string, message: string): Error {
  const error = new Error(message);
  (error as Error & { code: string }).code = code;
  return error;
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
