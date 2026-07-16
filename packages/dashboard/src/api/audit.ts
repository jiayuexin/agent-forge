import type { AuditEvent, AuditQueryResult } from '@agentforge/core';
import { apiClient } from './client.js';

export type { AuditEvent, AuditQueryResult };

export interface AuditListParams {
  from?: number;
  to?: number;
  action?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditEvents(params: AuditListParams = {}): Promise<AuditQueryResult> {
  const response = await apiClient.get<AuditQueryResult>('/audit', { params });
  return response.data;
}
