import { describe, it, expect, afterEach } from 'vitest';
import { startTestHub, requestJson } from '../helpers.js';

describe('Hub nodes API', () => {
  let hubServer: Awaited<ReturnType<typeof startTestHub>>;

  afterEach(async () => {
    await hubServer.hub.stop();
  });

  it('lists empty nodes', async () => {
    hubServer = await startTestHub();
    const result = await requestJson(hubServer.port, '/api/nodes', hubServer.adminToken);
    expect(result).toEqual([]);
  });

  it('returns 404 for unknown node', async () => {
    hubServer = await startTestHub();
    const response = await fetch(`http://127.0.0.1:${hubServer.port}/api/nodes/unknown`, {
      headers: { Authorization: `Bearer ${hubServer.adminToken}` },
    });
    expect(response.status).toBe(404);
    const result = await response.json();
    expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects invalid execute body', async () => {
    hubServer = await startTestHub();
    const response = await fetch(`http://127.0.0.1:${hubServer.port}/api/nodes/unknown/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hubServer.adminToken}` },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns runtime config', async () => {
    hubServer = await startTestHub();
    const result = await requestJson(hubServer.port, '/api/config', hubServer.adminToken);
    expect(result).toMatchObject({
      host: '127.0.0.1',
      version: '0.0.0',
    });
  });

  it('returns prometheus metrics', async () => {
    hubServer = await startTestHub();
    const response = await fetch(`http://127.0.0.1:${hubServer.port}/api/metrics`);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('hub_http_requests_total');
    expect(text).toContain('hub_connected_nodes');
  });
});
