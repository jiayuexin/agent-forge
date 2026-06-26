import { describe, it, expect, beforeEach } from 'vitest';
import { MockAgent, startTestServer, requestJson } from './helpers.js';
import { MetricsRegistry } from '../src/metrics/MetricsRegistry.js';
import { createDebugServer } from '../src/server.js';

describe('DebugServer', () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent({
      capabilities: [
        {
          name: 'mock-capability',
          description: 'A mock capability',
        },
      ],
    });
  });

  it('returns ok on health', async () => {
    const { server, port } = await startTestServer(agent);
    try {
      const result = await requestJson(port, '/api/health');
      expect(result).toEqual({ status: 'ok' });
    } finally {
      await server.stop();
    }
  });

  it('returns agent status', async () => {
    const { server, port } = await startTestServer(agent);
    try {
      const result = await requestJson(port, '/api/status');
      expect(result).toMatchObject({
        id: 'agent-1',
        name: 'mock-agent',
        role: 'assistant',
        status: 'ready',
      });
    } finally {
      await server.stop();
    }
  });

  it('returns agent capabilities', async () => {
    const { server, port } = await startTestServer(agent);
    try {
      const result = await requestJson(port, '/api/capabilities');
      expect(result).toEqual([
        {
          name: 'mock-capability',
          description: 'A mock capability',
        },
      ]);
    } finally {
      await server.stop();
    }
  });

  it('returns prometheus metrics', async () => {
    const metrics = new MetricsRegistry();
    const counter = metrics.counter('agentforge_http_requests_total', 'Total HTTP requests');
    counter.inc({ method: 'GET', route: '/api/health', status: '200' }, 1);

    const debugServer = createDebugServer(agent, { port: 0, host: '127.0.0.1', metrics });
    await new Promise<void>((resolve, reject) => {
      debugServer.server.once('error', reject);
      debugServer.server.once('listening', () => {
        debugServer.server.off('error', reject);
        resolve();
      });
      debugServer.server.listen(0, '127.0.0.1');
    });

    const address = debugServer.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/metrics`);
      const text = await response.text();
      expect(text).toContain('# HELP agentforge_http_requests_total Total HTTP requests');
      expect(text).toContain('agentforge_http_requests_total{method="GET",route="/api/health",status="200"} 1');
    } finally {
      await debugServer.stop();
    }
  });

  it('executes task', async () => {
    const { server, port } = await startTestServer(agent);
    try {
      const result = await requestJson(port, '/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', input: { message: 'hello' } }),
      });
      expect(result).toMatchObject({
        success: true,
        output: { content: 'mock result' },
      });
    } finally {
      await server.stop();
    }
  });

  it('streams task via SSE', async () => {
    const { server, port } = await startTestServer(agent);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', input: { message: 'hello' } }),
      });
      const text = await response.text();
      expect(text).toContain('data: {"type":"text","content":"mock chunk","index":0}');
      expect(text).toContain('data: {"type":"done","index":1}');
      expect(text).toContain('data: [DONE]');
    } finally {
      await server.stop();
    }
  });

  it('rejects invalid execute body', async () => {
    const { server, port } = await startTestServer(agent);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error.code).toBe('VALIDATION_ERROR');
    } finally {
      await server.stop();
    }
  });
});
