import { describe, it, expect, afterEach } from 'vitest';
import { startTestHub, requestJson } from '../helpers.js';

describe('API v1 contract', () => {
  let hubServer: Awaited<ReturnType<typeof startTestHub>>;

  afterEach(async () => {
    await hubServer.hub.stop();
  });

  it('serves OpenAPI for /api/v1 and deprecates legacy /api', async () => {
    hubServer = await startTestHub();
    const spec = (await requestJson(
      hubServer.port,
      '/api/v1/openapi.json',
      hubServer.adminToken
    )) as { openapi: string; servers: Array<{ url: string }>; paths: Record<string, unknown> };

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0]?.url).toBe('/api/v1');
    expect(spec.paths['/health']).toBeDefined();
    expect(spec.paths['/nodes/{id}/execute']).toBeDefined();
    expect(spec.paths['/admin/tokens']).toBeDefined();

    const legacy = await fetch(`http://127.0.0.1:${hubServer.port}/api/nodes`, {
      headers: { Authorization: `Bearer ${hubServer.adminToken}` },
    });
    expect(legacy.headers.get('deprecation')).toBe('true');
    expect(legacy.status).toBe(200);

    const health = await fetch(`http://127.0.0.1:${hubServer.port}/api/v1/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: 'ok' });
  });
});
