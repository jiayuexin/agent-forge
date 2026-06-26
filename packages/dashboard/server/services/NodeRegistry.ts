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
  RemoteTask,
} from '@agentforge/types';
import type { RemoteAgentInvoker } from '@agentforge/sdk';
import { createHttpError } from '@agentforge/http-server';
import { NodeSession } from './NodeSession.js';

export interface NodeRegistryOptions {
  heartbeatTimeoutMs?: number;
  cleanupIntervalMs?: number;
  logger?: Logger;
}

export class NodeRegistry implements RemoteAgentInvoker {
  private sessions = new Map<string, NodeSession>();
  private logger: Logger;
  private heartbeatTimeoutMs: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(options: NodeRegistryOptions = {}) {
    this.logger = options.logger ?? consoleLogger();
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 120000;
    this.cleanupTimer = setInterval(() => this.cleanup(), options.cleanupIntervalMs ?? 30000);
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
    const remoteTask: RemoteTask = {
      taskId: `${nodeId}-${Date.now()}`,
      type: 'execute',
      task,
      source: 'hub',
      issuedAt: Date.now(),
    };
    return session.execute(remoteTask);
  }

  async *stream(nodeId: string, task: AgentTask): AsyncIterable<AgentStreamChunk> {
    const session = this.requireSession(nodeId);
    const remoteTask: RemoteTask = {
      taskId: `${nodeId}-${Date.now()}`,
      type: 'stream',
      task,
      source: 'hub',
      issuedAt: Date.now(),
    };
    yield* session.stream(remoteTask);
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
    return JSON.parse(text) as AgentMessage;
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
