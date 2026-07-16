import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { createE2EMockAgent } from './fixtures/mock-agent.js';

const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN ?? 'admin-token';
/** Must match packages/dashboard/playwright.config.ts default. */
const e2ePort = process.env.AGENTFORGE_E2E_PORT ?? '8091';
const hubUrl = `http://127.0.0.1:${e2ePort}`;

async function waitForHealth(timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${hubUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Hub not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Hub health check timed out at ${hubUrl}`);
}

export default async function globalSetup(): Promise<void> {
  console.log(`E2E globalSetup: waiting for hub at ${hubUrl}`);
  await waitForHealth();
  console.log('E2E globalSetup: hub healthy, creating node token');

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

  console.log('E2E globalSetup: starting mock runtime client');
  await runtimeClient.start();

  (globalThis as unknown as { __MOCK_RUNTIME__: AgentRuntimeClient }).__MOCK_RUNTIME__ =
    runtimeClient;

  console.log('E2E mock runtime started');
}
