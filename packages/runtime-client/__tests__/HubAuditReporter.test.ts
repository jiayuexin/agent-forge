import { describe, expect, it, vi } from 'vitest';
import { createHubAuditReporter } from '../src/HubAuditReporter.js';

describe('createHubAuditReporter', () => {
  it('POSTs AuditEvent to Hub /api/audit with Bearer token', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    const report = createHubAuditReporter({
      hubUrl: 'ws://127.0.0.1:8080/ws/nodes/agent-1',
      authToken: 'node-token',
      actor: 'agent-1',
      fetch: fetchImpl,
    });

    await report({
      action: 'local-command',
      resource: 'echo hello',
      outcome: 'success',
      details: { tool: 'echo-cmd' },
    });

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8080/api/audit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer node-token',
      },
      body: JSON.stringify({
        action: 'local-command',
        resource: 'echo hello',
        outcome: 'success',
        details: { tool: 'echo-cmd' },
        actor: 'agent-1',
      }),
    });
  });

  it('throws AUDIT_REPORT_FAILED when Hub responds non-OK', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 }));
    const report = createHubAuditReporter({
      hubUrl: 'http://localhost:8080',
      authToken: 'token',
      actor: 'agent-1',
      fetch: fetchImpl,
    });

    await expect(
      report({ action: 'local-command', resource: 'ls', outcome: 'success' })
    ).rejects.toMatchObject({
      code: 'AUDIT_REPORT_FAILED',
    });
  });
});
