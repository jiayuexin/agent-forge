import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AuditEvent {
  timestamp: number;
  action: string;
  actor?: string;
  resource?: string;
  outcome: 'success' | 'failure' | 'denied';
  details?: Record<string, unknown>;
}

export class AuditLog {
  constructor(private readonly filePath: string = '.agentforge/audit.log') {}

  async record(event: Omit<AuditEvent, 'timestamp'> & { timestamp?: number }): Promise<void> {
    const entry: AuditEvent = {
      timestamp: event.timestamp ?? Date.now(),
      action: event.action,
      actor: event.actor,
      resource: event.resource,
      outcome: event.outcome,
      details: event.details,
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
  }
}
