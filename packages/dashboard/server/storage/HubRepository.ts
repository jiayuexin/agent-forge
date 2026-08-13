import type { Capability, GeneratedClientAgentDetail, HubTokenRole } from '@agentforge/types';
import type { AuditEvent, AuditQueryOptions, AuditQueryResult } from '@agentforge/core';

export interface TokenRecordInput {
  id: string;
  role: HubTokenRole;
  nodeIds?: string[];
  scopes?: string[];
  createdAt: number;
  expiresAt?: number;
  note?: string;
  tokenPrefix?: string;
  tokenHash: string;
  tokenSalt: string;
  lookupHash: string;
}

export interface HubTaskRecord {
  taskId: string;
  nodeId: string;
  idempotencyKey: string;
  state: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  resultJson?: string;
  updatedAt: number;
}

export interface HubRepository {
  migrate(): void;
  close(): void;
  backup(destinationPath: string): Promise<void>;

  listTokenRecords(): TokenRecordInput[];
  replaceTokens(records: TokenRecordInput[]): void;

  listCapabilities(): Array<{ id: string; versions: Capability[] }>;
  replaceCapabilities(records: Array<{ id: string; versions: Capability[] }>): void;

  listGeneratedAgents(): GeneratedClientAgentDetail[];
  replaceGeneratedAgents(records: GeneratedClientAgentDetail[]): void;

  recordAudit(event: AuditEvent): void;
  queryAudit(options: AuditQueryOptions): AuditQueryResult;

  getTask(idempotencyKey: string): HubTaskRecord | undefined;
  getTaskById(taskId: string): HubTaskRecord | undefined;
  upsertTask(record: HubTaskRecord): void;
}
