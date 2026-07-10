import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { createE2EMockAgent } from './fixtures/mock-agent.js';

const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN ?? 'admin-token';
const e2ePort = process.env.AGENTFORGE_E2E_PORT ?? '8090';
const hubUrl = `http://127.0.0.1:${e2ePort}`;
const dashboardDir = join(__dirname, '..');
const pidFile = join(dashboardDir, '.e2e-mock-runtime.pid');

async function waitForHealth(timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${hubUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Hub health check timed out');
}

export default async function globalSetup(): Promise<void> {
  await waitForHealth();

  const tokenResponse = await fetch(`${hubUrl}/api/admin/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nodeName: 'E2E Mock Node' }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to create node token: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as { token: string; nodeId: string };
  const agent = createE2EMockAgent({ id: tokenData.nodeId, name: 'E2E Mock Node' });
  const runtimeClient = new AgentRuntimeClient(agent, {
    hubUrl,
    websocketUrl: hubUrl.replace(/^http/, 'ws'),
    authToken: tokenData.token,
    nodeName: agent.name,
    heartbeatInterval: 5000,
    allowRemoteExecution: true,
  });

  runtimeClient.on('error', (error) => {
    console.error('Mock runtime error', error);
  });

  await runtimeClient.start();

  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, String(process.pid), 'utf-8');

  (global as unknown as { __MOCK_RUNTIME__: AgentRuntimeClient }).__MOCK_RUNTIME__ = runtimeClient;

  console.log('E2E mock runtime started');
}
