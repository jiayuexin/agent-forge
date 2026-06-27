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
}

export interface RemoteTask {
  taskId: string;
  type: 'execute' | 'stream' | 'chat';
  task: AgentTask;
  source: string;
  issuedAt: number;
  timeout?: number;
}

export interface ControlMessage {
  type: 'execute' | 'stream' | 'config-update' | 'capability-distribute' | 'ping' | 'stop';
  messageId: string;
  nodeId: string;
  timestamp: number;
  payload:
    | RemoteTask
    | Partial<AgentRuntimeConfig>
    | CapabilityDistributePayload
    | Record<string, unknown>;
}

export interface CapabilityDistributePayload {
  action: 'add' | 'update' | 'remove';
  capability: Capability;
  downloadUrl?: string;
  signature?: string;
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
    | 'local-approval-request'
    | 'pong'
    | 'error';
  messageId?: string;
  nodeId: string;
  timestamp: number;
  payload?:
    | AgentResult
    | AgentStreamChunk
    | AgentNodeStatus
    | AgentMetrics
    | CapabilityAckPayload
    | LocalApprovalRequest
    | import('./core.js').AgentError
    | Record<string, unknown>;
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

export interface IAgentRuntimeClient {
  readonly status: RuntimeClientStatus;
  readonly node: AgentNode;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: AgentMessage): void;
  onTask(handler: TaskHandler): void;
  onCapabilityDistribute(handler: CapabilityDistributeHandler): void;
}
