import type { AuditEvent, AuditQueryOptions, AuditQueryResult } from '@agentforge/core';
import type { HubRepository } from './HubRepository.js';

export class RepositoryAuditLog {
  constructor(private readonly repository: HubRepository) {}

  async record(event: Omit<AuditEvent, 'timestamp'> & { timestamp?: number }): Promise<void> {
    this.repository.recordAudit({
      timestamp: event.timestamp ?? Date.now(),
      action: event.action,
      actor: event.actor,
      resource: event.resource,
      outcome: event.outcome,
      details: event.details,
    });
  }

  async query(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    return this.repository.queryAudit(options);
  }
}
