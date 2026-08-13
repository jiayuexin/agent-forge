import type WebSocket from 'ws';
import type {
  AgentMessage,
  AgentNode,
  AgentResult,
  AgentStreamChunk,
  AgentTask,
  Capability,
  CapabilityAckPayload,
  CapabilityDistributePayload,
  ControlMessage,
  Logger,
  RemoteAgentInvoker,
  RemoteTask,
} from '@agentforge/types';
import { parseAgentMessagePayload } from '@agentforge/core';
import { createHttpError } from '@agentforge/http-server';
import { randomUUID } from 'node:crypto';
import { NodeSession, type NodeSessionEventListener } from './NodeSession.js';
import type { HubRepository, HubTaskRecord } from '../storage/HubRepository.js';

export interface NodeRegistryOptions {
  heartbeatTimeoutMs?: number;
  cleanupIntervalMs?: number;
  logger?: Logger;
  onEvent?: NodeSessionEventListener;
  repository?: HubRepository;
  onReconnect?: () => void;
  onTaskUnknown?: () => void;
}

export class NodeRegistry implements RemoteAgentInvoker {
  private sessions = new Map<string, NodeSession>();
  private logger: Logger;
  private heartbeatTimeoutMs: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private onEvent?: NodeSessionEventListener;
  private repository?: HubRepository;
  private onReconnect?: () => void;
  private onTaskUnknown?: () => void;

  constructor(options: NodeRegistryOptions = {}) {
    this.logger = options.logger ?? consoleLogger();
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 120000;
    this.cleanupTimer = setInterval(() => this.cleanup(), options.cleanupIntervalMs ?? 30000);
    this.onEvent = options.onEvent;
    this.repository = options.repository;
    this.onReconnect = options.onReconnect;
    this.onTaskUnknown = options.onTaskUnknown;
  }

  register(
    nodeId: string,
    ws: WebSocket,
    options: {
      name?: string;
      agentId?: string;
      tags?: string[];
      capabilities?: Capability[];
      hostInfo?: AgentNode['hostInfo'];
    } = {}
  ): NodeSession {
    const existing = this.sessions.get(nodeId);
    if (existing) {
      this.onReconnect?.();
      existing.close();
    }

    const session = new NodeSession(ws, {
      nodeId,
      name: options.name ?? nodeId,
      agentId: options.agentId ?? nodeId,
      tags: options.tags,
      capabilities: options.capabilities,
      hostInfo: options.hostInfo,
      logger: this.logger.child({ nodeId }),
      onEvent: this.onEvent,
    });

    ws.on('message', (data: WebSocket.RawData) => {
      const message = parseAgentMessage(data);
      if (message) {
        session.handleMessage(message);
      }
    });

    ws.on('close', () => {
      session.close();
      this.sessions.delete(nodeId);
      this.logger.info(`Node ${nodeId} disconnected`);
    });

    ws.on('error', (error: Error) => {
      this.logger.error(`Node ${nodeId} WebSocket error`, error);
      session.close();
      this.sessions.delete(nodeId);
    });

    this.sessions.set(nodeId, session);
    this.logger.info(`Node ${nodeId} registered`);
    return session;
  }

  unregister(nodeId: string): boolean {
    const session = this.sessions.get(nodeId);
    if (!session) return false;
    session.close();
    this.sessions.delete(nodeId);
    return true;
  }

  get(nodeId: string): NodeSession | undefined {
    return this.sessions.get(nodeId);
  }

  list(): AgentNode[] {
    return Array.from(this.sessions.values()).map((session) => session.node);
  }

  sendControlMessage(nodeId: string, message: ControlMessage): void {
    const session = this.requireSession(nodeId);
    session.send(message);
  }

  async execute(nodeId: string, task: AgentTask): Promise<AgentResult> {
    const session = this.requireSession(nodeId);
    const idempotencyKey = `${nodeId}:${JSON.stringify(task)}`;
    const existing = this.repository?.getTask(idempotencyKey);
    if (existing?.state === 'succeeded' && existing.resultJson) {
      return JSON.parse(existing.resultJson) as AgentResult;
    }

    const remoteTask: RemoteTask = {
      taskId: existing?.taskId ?? randomUUID(),
      idempotencyKey,
      type: 'execute',
      task,
      source: 'hub',
      issuedAt: Date.now(),
    };
    this.writeTask({
      taskId: remoteTask.taskId,
      nodeId,
      idempotencyKey,
      state: 'running',
      updatedAt: Date.now(),
    });
    try {
      const result = await session.execute(remoteTask);
      this.writeTask({
        taskId: remoteTask.taskId,
        nodeId,
        idempotencyKey,
        state: 'succeeded',
        resultJson: JSON.stringify(result),
        updatedAt: Date.now(),
      });
      return result;
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      const state: HubTaskRecord['state'] = code === 'TASK_UNKNOWN' ? 'unknown' : 'failed';
      if (state === 'unknown') {
        this.onTaskUnknown?.();
      }
      this.writeTask({
        taskId: remoteTask.taskId,
        nodeId,
        idempotencyKey,
        state,
        updatedAt: Date.now(),
      });
      throw error;
    }
  }

  async *stream(nodeId: string, task: AgentTask): AsyncIterable<AgentStreamChunk> {
    const session = this.requireSession(nodeId);
    const remoteTask: RemoteTask = {
      taskId: randomUUID(),
      idempotencyKey: `${nodeId}:stream:${JSON.stringify(task)}`,
      type: 'stream',
      task,
      source: 'hub',
      issuedAt: Date.now(),
    };
    yield* session.stream(remoteTask);
  }

  async cancel(nodeId: string, taskId: string): Promise<unknown> {
    const session = this.requireSession(nodeId);
    const result = await session.cancel(taskId);
    const existing = this.repository?.getTaskById(taskId);
    this.writeTask({
      taskId,
      nodeId,
      idempotencyKey: existing?.idempotencyKey ?? `cancel:${nodeId}:${taskId}`,
      state: 'cancelled',
      updatedAt: Date.now(),
    });
    return result;
  }

  async distribute(
    nodeIds: string[],
    payload: CapabilityDistributePayload
  ): Promise<Record<string, CapabilityAckPayload>> {
    const results: Record<string, CapabilityAckPayload> = {};
    await Promise.all(
      nodeIds.map(async (nodeId) => {
        try {
          const session = this.requireSession(nodeId);
          results[nodeId] = await session.distribute(payload);
        } catch (error) {
          results[nodeId] = {
            messageId: '',
            capabilityId: payload.capability.id,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );
    return results;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }

  private writeTask(record: HubTaskRecord): void {
    this.repository?.upsertTask(record);
  }

  private requireSession(nodeId: string): NodeSession {
    const session = this.sessions.get(nodeId);
    if (!session) {
      throw createHttpError('NODE_NOT_FOUND', `Node "${nodeId}" is not connected`, 404);
    }
    return session;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [nodeId, session] of this.sessions) {
      if (now - session.node.lastHeartbeat > this.heartbeatTimeoutMs) {
        this.logger.warn(`Node ${nodeId} heartbeat timeout`);
        session.close();
        this.sessions.delete(nodeId);
      }
    }
  }
}

function parseAgentMessage(data: WebSocket.RawData): AgentMessage | null {
  try {
    const text = typeof data === 'string' ? data : data.toString('utf-8');
    return parseAgentMessagePayload(JSON.parse(text));
  } catch {
    return null;
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
