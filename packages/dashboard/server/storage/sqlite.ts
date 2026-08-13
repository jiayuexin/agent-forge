import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import {
  AUDIT_RETENTION_MS,
  type AuditEvent,
  type AuditQueryOptions,
  type AuditQueryResult,
} from '@agentforge/core';
import type { Capability, GeneratedClientAgentDetail } from '@agentforge/types';
import type { HubRepository, HubTaskRecord, TokenRecordInput } from './HubRepository.js';

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

const SCHEMA_VERSION = 1;

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  lookup_hash TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  token_salt TEXT NOT NULL,
  token_prefix TEXT,
  role TEXT NOT NULL,
  node_ids TEXT NOT NULL,
  scopes TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS capability_versions (
  id TEXT NOT NULL,
  version TEXT,
  ordinal INTEGER NOT NULL,
  definition TEXT NOT NULL,
  PRIMARY KEY (id, ordinal)
);

CREATE TABLE IF NOT EXISTS generated_agents (
  id TEXT PRIMARY KEY,
  definition TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor TEXT,
  resource TEXT,
  outcome TEXT NOT NULL,
  details TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  result_json TEXT,
  updated_at INTEGER NOT NULL
);
`;

export class SqliteHubRepository implements HubRepository {
  private readonly db: SqliteDatabase;
  private readonly databasePath: string;
  private readonly onError?: () => void;

  constructor(databasePath: string, options: { onError?: () => void } = {}) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.databasePath = databasePath;
    this.onError = options.onError;
    this.db = new DatabaseSync(databasePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  private run<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      this.onError?.();
      throw error;
    }
  }

  migrate(): void {
    this.run(() => {
      this.db.exec(MIGRATION_V1);
      const applied = this.db
        .prepare('SELECT version FROM schema_migrations WHERE version = ?')
        .get(SCHEMA_VERSION) as { version: number } | undefined;
      if (!applied) {
        this.db
          .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(SCHEMA_VERSION, Date.now());
      }
    });
  }

  close(): void {
    this.db.close();
  }

  async backup(destinationPath: string): Promise<void> {
    mkdirSync(dirname(destinationPath), { recursive: true });
    this.run(() => {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      copyFileSync(this.databasePath, destinationPath);
    });
  }

  listTokenRecords(): TokenRecordInput[] {
    return this.run(() => {
      const rows = this.db.prepare('SELECT * FROM tokens').all() as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: String(row.id),
        lookupHash: String(row.lookup_hash),
        tokenHash: String(row.token_hash),
        tokenSalt: String(row.token_salt),
        tokenPrefix: row.token_prefix ? String(row.token_prefix) : undefined,
        role: row.role as TokenRecordInput['role'],
        nodeIds: JSON.parse(String(row.node_ids)) as string[],
        scopes: row.scopes ? (JSON.parse(String(row.scopes)) as string[]) : undefined,
        createdAt: Number(row.created_at),
        expiresAt: row.expires_at == null ? undefined : Number(row.expires_at),
        note: row.note ? String(row.note) : undefined,
      }));
    });
  }

  replaceTokens(records: TokenRecordInput[]): void {
    this.run(() => {
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM tokens').run();
        const stmt = this.db.prepare(`
          INSERT INTO tokens (
            id, lookup_hash, token_hash, token_salt, token_prefix, role, node_ids, scopes, created_at, expires_at, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const record of records) {
          stmt.run(
            record.id,
            record.lookupHash,
            record.tokenHash,
            record.tokenSalt,
            record.tokenPrefix ?? null,
            record.role,
            JSON.stringify(record.nodeIds ?? []),
            record.scopes ? JSON.stringify(record.scopes) : null,
            record.createdAt,
            record.expiresAt ?? null,
            record.note ?? null
          );
        }
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  listCapabilities(): Array<{ id: string; versions: Capability[] }> {
    return this.run(() => {
      const ids = this.db.prepare('SELECT id FROM capabilities').all() as Array<{ id: string }>;
      return ids.map((row) => {
        const versions = this.db
          .prepare('SELECT definition FROM capability_versions WHERE id = ? ORDER BY ordinal ASC')
          .all(row.id) as Array<{ definition: string }>;
        return {
          id: row.id,
          versions: versions.map((item) => JSON.parse(item.definition) as Capability),
        };
      });
    });
  }

  replaceCapabilities(records: Array<{ id: string; versions: Capability[] }>): void {
    this.run(() => {
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM capability_versions').run();
        this.db.prepare('DELETE FROM capabilities').run();
        const insertCap = this.db.prepare('INSERT INTO capabilities (id) VALUES (?)');
        const insertVersion = this.db.prepare(
          'INSERT INTO capability_versions (id, version, ordinal, definition) VALUES (?, ?, ?, ?)'
        );
        for (const record of records) {
          insertCap.run(record.id);
          record.versions.forEach((capability, ordinal) => {
            insertVersion.run(
              record.id,
              capability.version ?? null,
              ordinal,
              JSON.stringify(capability)
            );
          });
        }
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  listGeneratedAgents(): GeneratedClientAgentDetail[] {
    return this.run(() => {
      const rows = this.db.prepare('SELECT definition FROM generated_agents').all() as Array<{
        definition: string;
      }>;
      return rows.map((row) => JSON.parse(row.definition) as GeneratedClientAgentDetail);
    });
  }

  replaceGeneratedAgents(records: GeneratedClientAgentDetail[]): void {
    this.run(() => {
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM generated_agents').run();
        const stmt = this.db.prepare('INSERT INTO generated_agents (id, definition) VALUES (?, ?)');
        for (const record of records) {
          stmt.run(record.id, JSON.stringify(record));
        }
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  recordAudit(event: AuditEvent): void {
    this.run(() => {
      this.db
        .prepare(
          'INSERT INTO audit_events (timestamp, action, actor, resource, outcome, details) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          event.timestamp,
          event.action,
          event.actor ?? null,
          event.resource ?? null,
          event.outcome,
          event.details ? JSON.stringify(event.details) : null
        );
    });
  }

  queryAudit(options: AuditQueryOptions = {}): AuditQueryResult {
    return this.run(() => {
      const now = Date.now();
      const retentionFloor = now - AUDIT_RETENTION_MS;
      const from = Math.max(options.from ?? retentionFloor, retentionFloor);
      const to = options.to ?? now;
      const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
      const offset = Math.max(options.offset ?? 0, 0);

      const rows = this.db
        .prepare(
          `SELECT timestamp, action, actor, resource, outcome, details
           FROM audit_events
           WHERE timestamp >= ? AND timestamp <= ?
           ${options.action ? 'AND action = ?' : ''}
           ORDER BY timestamp DESC`
        )
        .all(...(options.action ? [from, to, options.action] : [from, to])) as Array<
        Record<string, unknown>
      >;

      const items = rows.map((row) => ({
        timestamp: Number(row.timestamp),
        action: String(row.action),
        actor: row.actor ? String(row.actor) : undefined,
        resource: row.resource ? String(row.resource) : undefined,
        outcome: row.outcome as AuditEvent['outcome'],
        details: row.details
          ? (JSON.parse(String(row.details)) as Record<string, unknown>)
          : undefined,
      }));

      return {
        items: items.slice(offset, offset + limit),
        total: items.length,
      };
    });
  }

  getTask(idempotencyKey: string): HubTaskRecord | undefined {
    return this.run(() =>
      this.readTask(
        this.db.prepare('SELECT * FROM tasks WHERE idempotency_key = ?').get(idempotencyKey)
      )
    );
  }

  getTaskById(taskId: string): HubTaskRecord | undefined {
    return this.run(() =>
      this.readTask(this.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId))
    );
  }

  upsertTask(record: HubTaskRecord): void {
    this.run(() => {
      this.db
        .prepare(
          `INSERT INTO tasks (task_id, node_id, idempotency_key, state, result_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(task_id) DO UPDATE SET
             node_id = excluded.node_id,
             idempotency_key = excluded.idempotency_key,
             state = excluded.state,
             result_json = excluded.result_json,
             updated_at = excluded.updated_at`
        )
        .run(
          record.taskId,
          record.nodeId,
          record.idempotencyKey,
          record.state,
          record.resultJson ?? null,
          record.updatedAt
        );
    });
  }

  private readTask(row: unknown): HubTaskRecord | undefined {
    if (!row || typeof row !== 'object') {
      return undefined;
    }
    const record = row as Record<string, unknown>;
    return {
      taskId: String(record.task_id),
      nodeId: String(record.node_id),
      idempotencyKey: String(record.idempotency_key),
      state: record.state as HubTaskRecord['state'],
      resultJson: record.result_json ? String(record.result_json) : undefined,
      updatedAt: Number(record.updated_at),
    };
  }
}

export function openHubRepository(
  databasePath: string,
  options: { onError?: () => void } = {}
): SqliteHubRepository {
  return new SqliteHubRepository(databasePath, options);
}
