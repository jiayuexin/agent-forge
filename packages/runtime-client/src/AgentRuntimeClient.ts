import { EventEmitter } from 'node:events';
import type {
  AgentMessage,
  AgentNode,
  AgentNodeStatus,
  AgentRuntimeConfig,
  AgentStreamChunk,
  Capability,
  CapabilityAckPayload,
  CapabilityDistributeHandler,
  CapabilityDistributePayload,
  ControlMessage,
  IAgentRuntimeClient,
  IClientAgent,
  Logger,
  RemoteTask,
  RuntimeClientStatus,
  TaskHandler,
} from '@agentforge/types';
import { AgentStatus as Status } from '@agentforge/types';
import { CoreError, SimpleLogger } from '@agentforge/core';
import { CapabilityCache } from './CapabilityCache.js';
import { HeartbeatManager } from './HeartbeatManager.js';
import { WebSocketTransport } from './WebSocketTransport.js';
import {
  isCapabilityDistributePayload,
  isPartialAgentRuntimeConfig,
  isRemoteTask,
} from './type-guards.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
export interface AgentRuntimeClient {
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export class AgentRuntimeClient extends EventEmitter implements IAgentRuntimeClient {
  readonly node: AgentNode;

  private readonly agent: IClientAgent;
  private readonly config: AgentRuntimeConfig;
  private readonly logger: Logger;
  private readonly cache: CapabilityCache;
  private readonly transport: WebSocketTransport;
  private readonly heartbeat: HeartbeatManager;

  private taskHandler?: TaskHandler;
  private capabilityHandler?: CapabilityDistributeHandler;
  private _status: RuntimeClientStatus = 'disconnected';
  private stopped = false;

  constructor(agent: IClientAgent, config: AgentRuntimeConfig) {
    super();

    this.agent = agent;
    this.config = {
      heartbeatInterval: 30000,
      reconnect: { enabled: true, maxAttempts: 10, delayMs: 1000, backoffMultiplier: 2 },
      ...config,
    };

    this.logger = new SimpleLogger({ nodeId: agent.id, agentId: agent.id });

    this.node = {
      id: agent.id,
      name: config.nodeName ?? agent.name,
      agentId: agent.id,
      status: 'offline',
      tags: config.tags ?? [],
      capabilities: this.agentCapabilitiesToCapabilities(agent),
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      metrics: null,
    };

    this.cache = new CapabilityCache({
      cacheDir: config.capabilityCacheDir ?? '.agentforge/capabilities',
      logger: this.logger.child({ component: 'CapabilityCache' }),
    });

    this.transport = new WebSocketTransport({
      nodeId: this.node.id,
      hubUrl: this.config.hubUrl,
      websocketUrl: this.config.websocketUrl,
      authToken: this.config.authToken,
      reconnect: this.config.reconnect,
      logger: this.logger.child({ component: 'WebSocketTransport' }),
    });

    this.heartbeat = new HeartbeatManager(this.transport, {
      intervalMs: this.config.heartbeatInterval,
      produce: () => this.buildStatusMessage(),
      logger: this.logger.child({ component: 'HeartbeatManager' }),
    });

    this.transport.on('open', () => {
      this._status = 'connected';
      this.node.status = 'online';
      this.send(this.buildRegistrationMessage());
      this.heartbeat.start();
      this.emit('connected');
    });

    this.transport.on('close', () => {
      this._status = 'disconnected';
      this.node.status = 'offline';
      this.heartbeat.stop();
      this.emit('disconnected');
    });

    this.transport.on('error', (error: Error) => {
      this._status = 'error';
      this.logger.error('Transport error', error);
      this.emit('error', error);
    });

    this.transport.on('message', (message: ControlMessage) => {
      void this.handleControlMessage(message);
    });
  }

  get status(): RuntimeClientStatus {
    return this._status;
  }

  async start(): Promise<void> {
    if (this.stopped) {
      throw new CoreError('CLIENT_STOPPED', 'Cannot start a stopped runtime client');
    }

    if (this.agent.status === Status.UNINITIALIZED) {
      await this.agent.init();
    }

    await this.agent.startDaemon();

    const cachedCapabilities = await this.cache.load();
    this.node.capabilities = this.mergeCapabilities(
      this.agentCapabilitiesToCapabilities(this.agent),
      cachedCapabilities
    );

    await this.transport.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.heartbeat.stop();
    this.transport.disconnect();
    this._status = 'disconnected';
    this.node.status = 'offline';
    await this.agent.stopDaemon();
  }

  send(message: AgentMessage): void {
    const enriched: AgentMessage = {
      ...message,
      nodeId: message.nodeId ?? this.node.id,
      timestamp: message.timestamp ?? Date.now(),
    };

    this.transport.send(enriched);
  }

  onTask(handler: TaskHandler): void {
    this.taskHandler = handler;
  }

  onCapabilityDistribute(handler: CapabilityDistributeHandler): void {
    this.capabilityHandler = handler;
  }

  private async handleControlMessage(message: ControlMessage): Promise<void> {
    if (message.nodeId !== this.node.id) {
      this.logger.warn('Ignoring control message for different node', { message });
      return;
    }

    switch (message.type) {
      case 'ping':
        this.send({
          type: 'pong',
          messageId: message.messageId,
          nodeId: this.node.id,
          timestamp: Date.now(),
          payload: { messageId: message.messageId },
        });
        break;

      case 'execute':
        await this.handleExecute(message);
        break;

      case 'stream':
        await this.handleStream(message);
        break;

      case 'capability-distribute':
        await this.handleCapabilityDistribute(message);
        break;

      case 'config-update':
        await this.handleConfigUpdate(message);
        break;

      case 'stop':
        await this.stop();
        break;

      default:
        this.logger.warn('Unhandled control message type', { type: message.type });
    }
  }

  private async handleExecute(message: ControlMessage): Promise<void> {
    if (!isRemoteTask(message.payload)) {
      this.sendError(message.messageId, 'INVALID_CONTROL_MESSAGE', 'Expected RemoteTask payload');
      return;
    }

    if (!this.config.allowRemoteExecution) {
      this.sendError(
        message.messageId,
        'REMOTE_EXECUTION_DISABLED',
        'Remote execution is disabled for this node'
      );
      return;
    }

    try {
      this.node.status = 'busy';
      const result = this.taskHandler
        ? await this.taskHandler(message.payload)
        : await this.agent.execute(message.payload.task);

      this.send({
        type: 'result',
        messageId: message.messageId,
        nodeId: this.node.id,
        timestamp: Date.now(),
        payload: result,
      });
    } catch (error) {
      this.sendError(message.messageId, this.toAgentError(error));
    } finally {
      this.node.status = 'online';
    }
  }

  private async handleStream(message: ControlMessage): Promise<void> {
    if (!isRemoteTask(message.payload)) {
      this.sendError(message.messageId, 'INVALID_CONTROL_MESSAGE', 'Expected RemoteTask payload');
      return;
    }

    if (!this.config.allowRemoteExecution) {
      this.sendError(
        message.messageId,
        'REMOTE_EXECUTION_DISABLED',
        'Remote execution is disabled for this node'
      );
      return;
    }

    try {
      this.node.status = 'busy';
      const stream = this.taskHandler
        ? await this.runTaskHandlerAsStream(message.payload)
        : this.agent.stream(message.payload.task);

      let lastIndex = 0;

      for await (const chunk of stream) {
        lastIndex = chunk.index;
        this.send({
          type: 'stream-chunk',
          messageId: message.messageId,
          nodeId: this.node.id,
          timestamp: Date.now(),
          payload: chunk,
        });
      }

      this.send({
        type: 'stream-chunk',
        messageId: message.messageId,
        nodeId: this.node.id,
        timestamp: Date.now(),
        payload: { type: 'done', index: lastIndex + 1 } as AgentStreamChunk,
      });
    } catch (error) {
      this.sendError(message.messageId, this.toAgentError(error));
    } finally {
      this.node.status = 'online';
    }
  }

  private async runTaskHandlerAsStream(task: RemoteTask): Promise<AsyncIterable<AgentStreamChunk>> {
    const result = await (this.taskHandler as TaskHandler)(task);

    return (async function* () {
      yield {
        type: 'text',
        content: result.output.content,
        index: 0,
      } as AgentStreamChunk;
      yield { type: 'done', index: 1 } as AgentStreamChunk;
    })();
  }

  private async handleCapabilityDistribute(message: ControlMessage): Promise<void> {
    if (!isCapabilityDistributePayload(message.payload)) {
      this.sendError(
        message.messageId,
        'INVALID_CONTROL_MESSAGE',
        'Expected CapabilityDistributePayload'
      );
      return;
    }

    const payload = message.payload;
    let ack: CapabilityAckPayload;

    if (this.capabilityHandler) {
      ack = await this.capabilityHandler(payload);
    } else {
      ack = await this.handleCacheCapability(payload);
    }

    ack.messageId = message.messageId;

    this.send({
      type: 'capability-ack',
      messageId: message.messageId,
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: ack,
    });

    if (ack.status === 'installed') {
      this.node.capabilities = this.mergeCapabilities(
        this.agentCapabilitiesToCapabilities(this.agent),
        this.cache.list()
      );
    }
  }

  private async handleCacheCapability(
    payload: CapabilityDistributePayload
  ): Promise<CapabilityAckPayload> {
    switch (payload.action) {
      case 'add':
        return this.cache.install(payload);
      case 'update':
        return this.cache.update(payload);
      case 'remove':
        return this.cache.remove(payload.capability.id);
      default:
        return {
          messageId: '',
          capabilityId: payload.capability.id,
          status: 'failed',
          error: `Unknown capability action`,
        };
    }
  }

  private async handleConfigUpdate(message: ControlMessage): Promise<void> {
    if (!isPartialAgentRuntimeConfig(message.payload)) {
      this.sendError(
        message.messageId,
        'INVALID_CONTROL_MESSAGE',
        'Expected partial AgentRuntimeConfig payload'
      );
      return;
    }

    Object.assign(this.config, message.payload);
    this.logger.info('Runtime config updated', message.payload);
  }

  private buildStatusMessage(): AgentMessage {
    return {
      type: 'status',
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: this.node.status as AgentNodeStatus,
    };
  }

  private buildRegistrationMessage(): AgentMessage {
    return {
      type: 'event',
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: { event: 'node:register', node: this.node },
    };
  }

  private sendError(messageId: string, code: string, message: string): void;
  private sendError(messageId: string, error: { code: string; message: string; details?: unknown }): void;
  private sendError(
    messageId: string,
    codeOrError: string | { code: string; message: string; details?: unknown },
    maybeMessage?: string
  ): void {
    const error =
      typeof codeOrError === 'string'
        ? { code: codeOrError, message: maybeMessage ?? '' }
        : codeOrError;

    this.send({
      type: 'error',
      messageId,
      nodeId: this.node.id,
      timestamp: Date.now(),
      payload: error,
    });
  }

  private toAgentError(error: unknown): { code: string; message: string; details?: unknown } {
    if (error instanceof CoreError) {
      return { code: error.code, message: error.message, details: error.details };
    }

    if (error instanceof Error) {
      return { code: 'RUNTIME_ERROR', message: error.message };
    }

    return { code: 'RUNTIME_ERROR', message: String(error) };
  }

  private agentCapabilitiesToCapabilities(agent: IClientAgent): Capability[] {
    return agent.capabilities.map((cap) => ({
      id: `${agent.id}:${cap.name}`,
      type: 'agent',
      name: cap.name,
      description: cap.description,
      inputSchema: cap.inputSchema,
      outputSchema: cap.outputSchema,
      riskLevel: cap.riskLevel,
      sensitiveOperations: cap.sensitiveOperations,
    }));
  }

  private mergeCapabilities(a: Capability[], b: Capability[]): Capability[] {
    const map = new Map<string, Capability>();
    for (const cap of a) {
      map.set(cap.id, cap);
    }
    for (const cap of b) {
      map.set(cap.id, cap);
    }
    return Array.from(map.values());
  }
}
