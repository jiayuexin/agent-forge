import type { Capability } from './capability.js';
import type { AgentMetrics, AgentStreamChunk } from './core.js';
import type { AgentResult } from './result.js';
import type { AgentTask } from './task.js';

/**
 * ClientAgent runtime and remote-control message types.
 */

export type AgentNodeStatus = 'online' | 'offline' | 'busy' | 'error';

export interface AgentNode {
  id: string;
  name: string;
  agentId: string;
  status: AgentNodeStatus;
  tags: string[];
  capabilities: Capability[];
  registeredAt: number;
  lastHeartbeat: number;
  metrics: AgentMetrics | null;
  hostInfo?: {
    hostname: string;
    ip: string;
    pid: number;
  };
  connection?: {
    protocol: 'websocket';
    connectedAt: number;
    lastPingAt: number;
  };
}

export const HUB_PROTOCOL_VERSION = 1;
export const HUB_WS_SUBPROTOCOL = 'agentforge.v1';
export const HUB_WS_BEARER_PREFIX = 'agentforge.bearer.';

export type HubTaskState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';

export interface AgentRuntimeConfig {
  hubUrl: string;
  websocketUrl?: string;
  authToken?: string;
  nodeName?: string;
  tags?: string[];
  heartbeatInterval?: number;
  reconnect?: {
    enabled?: boolean;
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
  };
  allowRemoteExecution?: boolean;
  requireLocalConfirmation?: string[];
  capabilityCacheDir?: string;
  capabilityTrustStoreDir?: string;
}

export interface RemoteTask {
  taskId: string;
  idempotencyKey?: string;
  type: 'execute' | 'stream' | 'chat';
  task: AgentTask;
  source: string;
  issuedAt: number;
  timeout?: number;
}

export interface ControlMessage {
  type:
    | 'execute'
    | 'stream'
    | 'config-update'
    | 'capability-distribute'
    | 'cancel'
    | 'ping'
    | 'stop';
  protocolVersion?: number;
  messageId: string;
  nodeId: string;
  timestamp: number;
  payload:
    | RemoteTask
    | Partial<AgentRuntimeConfig>
    | CapabilityDistributePayload
    | CancelTaskPayload
    | Record<string, unknown>;
}

export interface CancelTaskPayload {
  taskId: string;
}

export interface CapabilityDistributePayload {
  action: 'add' | 'update' | 'remove';
  capability: Capability;
  targetVersion?: string;
}

export interface AgentMessage {
  type:
    | 'result'
    | 'stream-chunk'
    | 'status'
    | 'metric'
    | 'event'
    | 'capability-ack'
    | 'config-ack'
    | 'local-approval-request'
    | 'pong'
    | 'error';
  protocolVersion?: number;
  messageId?: string;
  nodeId: string;
  timestamp: number;
  payload?:
    | AgentResult
    | AgentStreamChunk
    | AgentNodeStatus
    | AgentMetrics
    | CapabilityAckPayload
    | ConfigAckPayload
    | LocalApprovalRequest
    | import('./core.js').AgentError
    | Record<string, unknown>;
}

export interface ConfigAckPayload {
  status: 'applied' | 'rejected';
  error?: string;
}

export interface CapabilityAckPayload {
  messageId: string;
  capabilityId: string;
  status: 'downloaded' | 'installed' | 'failed';
  installedVersion?: string;
  error?: string;
}

export interface LocalApprovalRequest {
  requestId: string;
  type: 'sensitive-operation' | 'local-command' | 'capability-install';
  description: string;
  summary: Record<string, unknown>;
}

export type RuntimeClientStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type ControlMessageType = ControlMessage['type'];

export type TaskHandler = (task: RemoteTask) => Promise<AgentResult>;

export type CapabilityDistributeHandler = (
  payload: CapabilityDistributePayload
) => Promise<CapabilityAckPayload>;

export interface RemoteAgentInvoker {
  execute(nodeId: string, task: AgentTask): Promise<AgentResult>;
  stream?(nodeId: string, task: AgentTask): AsyncIterable<AgentStreamChunk>;
}

export interface IAgentRuntimeClient {
  readonly status: RuntimeClientStatus;
  readonly node: AgentNode;
  start(): Promise<void>;
  stop(): Promise<void>;
  executeCapability(capabilityId: string, task: AgentTask): Promise<AgentResult>;
  send(message: AgentMessage): void;
  onTask(handler: TaskHandler): void;
  onCapabilityDistribute(handler: CapabilityDistributeHandler): void;
}
