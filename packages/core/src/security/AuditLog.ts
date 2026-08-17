import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AuditEvent {
  timestamp: number;
  action: string;
  actor?: string;
  resource?: string;
  outcome: 'success' | 'failure' | 'denied';
  details?: Record<string, unknown>;
}

export interface AuditQueryOptions {
  from?: number;
  to?: number;
  action?: string;
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  items: AuditEvent[];
  total: number;
}

/** Default retention / query window: 90 days. */
export const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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

  async query(options: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    const now = Date.now();
    const retentionFloor = now - AUDIT_RETENTION_MS;
    const from = Math.max(options.from ?? retentionFloor, retentionFloor);
    const to = options.to ?? now;
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(options.offset ?? 0, 0);

    const events = await this.readAll();
    const filtered = events
      .filter((event) => event.timestamp >= from && event.timestamp <= to)
      .filter((event) => (options.action ? event.action === options.action : true))
      .sort((a, b) => b.timestamp - a.timestamp);

    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  private async readAll(): Promise<AuditEvent[]> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AuditEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
