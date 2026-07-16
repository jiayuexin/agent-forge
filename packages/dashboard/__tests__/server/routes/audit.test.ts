import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLog } from '@agentforge/core';
import { createAuditRoute } from '../../../server/routes/audit.js';
import { startRouteServer, type RouteServer } from '../route-helpers.js';
import { startTestHub, requestJson } from '../../helpers.js';

describe('audit route', () => {
  let routeServer: RouteServer;
  let auditLog: AuditLog;
  let tempDir: string;
  let url: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hub-audit-route-'));
    auditLog = new AuditLog(join(tempDir, 'audit.log'));
    routeServer = await startRouteServer(createAuditRoute(auditLog), '/api/audit');
    url = routeServer.url;
  });

  afterEach(async () => {
    await routeServer.stop();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('GET /api/audit returns empty list', async () => {
    const response = await fetch(`${url}/api/audit`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: unknown[]; total: number };
    expect(body).toEqual({ items: [], total: 0 });
  });

  it('GET /api/audit returns recorded events with filters and pagination', async () => {
    const base = Date.now() - 60_000;
    await auditLog.record({
      action: 'local-command',
      actor: 'node-1',
      resource: 'git status',
      outcome: 'success',
      timestamp: base,
    });
    await auditLog.record({
      action: 'capability-distribute',
      actor: 'admin',
      resource: 'cap-1',
      outcome: 'success',
      timestamp: base + 1000,
    });
    await auditLog.record({
      action: 'config-change',
      actor: 'admin',
      resource: 'node-1',
      outcome: 'success',
      timestamp: base + 2000,
    });

    const response = await fetch(
      `${url}/api/audit?from=${base + 500}&to=${base + 2500}&limit=1&offset=0`
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Array<{ action: string }>;
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].action).toBe('config-change');

    const byAction = await fetch(`${url}/api/audit?action=local-command`);
    const filtered = (await byAction.json()) as { items: Array<{ action: string }>; total: number };
    expect(filtered.total).toBe(1);
    expect(filtered.items[0].action).toBe('local-command');
  });

  it('POST /api/audit records an event', async () => {
    const response = await fetch(`${url}/api/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'local-command',
        actor: 'node-1',
        resource: 'ls',
        outcome: 'success',
        details: { source: 'client' },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const list = await fetch(`${url}/api/audit`);
    const body = (await list.json()) as {
      items: Array<{ action: string; actor?: string }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      action: 'local-command',
      actor: 'node-1',
      resource: 'ls',
      outcome: 'success',
    });
  });
});

describe('Hub audit integration', () => {
  let hubServer: Awaited<ReturnType<typeof startTestHub>>;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'hub-audit-int-'));
  });

  afterEach(async () => {
    await hubServer.hub.stop();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('records capability-distribute on distribute and exposes via GET /api/audit', async () => {
    hubServer = await startTestHub({ dataDir });
    const { port, adminToken } = hubServer;

    await requestJson(port, '/api/capabilities', adminToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'cap-audit',
        type: 'tool',
        name: 'audit-tool',
        description: 'for audit',
        endpointType: 'local-function',
        endpoint: { target: 'tools.audit' },
        inputSchema: { type: 'object' },
      }),
    });

    await requestJson(port, '/api/capabilities/cap-audit/distribute', adminToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeIds: ['node-a'], action: 'add' }),
    });

    const result = (await requestJson(
      port,
      '/api/audit?action=capability-distribute',
      adminToken
    )) as {
      items: Array<{ action: string; resource?: string; details?: Record<string, unknown> }>;
      total: number;
    };
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.items[0]).toMatchObject({
      action: 'capability-distribute',
      resource: 'cap-audit',
      outcome: 'success',
    });
  });
});
