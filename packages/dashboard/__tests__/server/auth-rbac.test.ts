import { describe, it, expect, afterEach } from 'vitest';
import { startTestHub, requestJson } from '../helpers.js';

async function requestStatus(
  port: number,
  path: string,
  token: string,
  init?: RequestInit
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

describe('Hub RBAC', () => {
  let hubServer: Awaited<ReturnType<typeof startTestHub>>;

  afterEach(async () => {
    await hubServer.hub.stop();
  });

  it('enforces admin, node, and readonly token scopes', async () => {
    hubServer = await startTestHub();
    const { port, adminToken, hub } = hubServer;

    const readonly = hub.tokenStore.create({ role: 'readonly' });
    const node = hub.tokenStore.create({ nodeName: 'scoped-node' });
    const otherNode = hub.tokenStore.create({ nodeName: 'other-node' });

    const unauthenticated = await fetch(`http://127.0.0.1:${port}/api/v1/nodes`);
    expect(unauthenticated.status).toBe(401);

    const readonlyMetrics = await requestStatus(port, '/api/v1/metrics', readonly.token);
    expect(readonlyMetrics.status).toBe(403);

    const createToken = await requestStatus(port, '/api/v1/admin/tokens', readonly.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'node', nodeName: 'denied' }),
    });
    expect(createToken.status).toBe(403);

    const nodeCreateToken = await requestStatus(port, '/api/v1/admin/tokens', node.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(nodeCreateToken.status).toBe(403);

    const nodeExecute = await requestStatus(
      port,
      `/api/v1/nodes/${node.nodeId}/execute`,
      node.token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', input: { message: 'nope' } }),
      }
    );
    expect(nodeExecute.status).toBe(403);

    const otherNodeRead = await requestStatus(
      port,
      `/api/v1/nodes/${otherNode.nodeId}`,
      node.token
    );
    expect(otherNodeRead.status).toBe(403);

    const readonlyList = await requestJson(port, '/api/v1/nodes', readonly.token);
    expect(readonlyList).toEqual([]);

    const spoofedAudit = await requestStatus(port, '/api/v1/audit', node.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'local-command',
        actor: 'admin',
        resource: 'ls',
        outcome: 'success',
      }),
    });
    expect(spoofedAudit.status).toBe(200);

    const forbiddenAudit = await requestStatus(port, '/api/v1/audit', node.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'capability-distribute',
        outcome: 'success',
      }),
    });
    expect(forbiddenAudit.status).toBe(403);

    const events = (await requestJson(port, '/api/v1/audit?action=local-command', adminToken)) as {
      items: Array<{ actor?: string }>;
    };
    expect(events.items[0]?.actor).toBe(node.nodeIds[0]);
  });
});
