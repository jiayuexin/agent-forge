import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createStaticHandler } from '../../../server/static.js';
import { startRouteServer, type RouteServer } from '../route-helpers.js';

function fetchRawPath(baseUrl: string, rawPath: string): Promise<{ status: number; body: string }> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port: Number(port), path: rawPath, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('static handler', () => {
  let routeServer: RouteServer;
  let staticDir: string;
  let url: string;

  beforeEach(async () => {
    staticDir = mkdtempSync(join(tmpdir(), 'static-test-'));
    writeFileSync(join(staticDir, 'index.html'), '<html></html>');
    writeFileSync(join(staticDir, 'app.js'), 'console.log("hello");');

    routeServer = await startRouteServer(createStaticHandler({ staticDir }), '/', null);
    url = routeServer.url;
  });

  afterEach(async () => {
    await routeServer.stop();
    rmSync(staticDir, { recursive: true, force: true });
  });

  it('serves a known static file with the correct MIME type', async () => {
    const response = await fetch(`${url}/app.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/javascript; charset=utf-8');

    const text = await response.text();
    expect(text).toBe('console.log("hello");');
  });

  it('blocks path traversal', async () => {
    const { status } = await fetchRawPath(url, '/../../etc/passwd');
    expect(status).toBe(403);
  });

  it('falls back to index.html for unknown routes', async () => {
    const response = await fetch(`${url}/unknown-route`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');

    const text = await response.text();
    expect(text).toBe('<html></html>');
  });

  it('skips /api/* and /ws paths', async () => {
    const apiResponse = await fetch(`${url}/api/foo`);
    expect(apiResponse.status).toBe(404);

    const wsResponse = await fetch(`${url}/ws`);
    expect(wsResponse.status).toBe(404);
  });
});
