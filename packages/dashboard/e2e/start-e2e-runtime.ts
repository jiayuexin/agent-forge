import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { createE2EClientAgent, E2E_NODE_NAME } from './fixtures/e2e-agent.js';

const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN ?? 'admin-token';
const e2ePort = process.env.AGENTFORGE_E2E_PORT ?? '8091';
const hubUrl = `http://127.0.0.1:${e2ePort}`;

async function waitForHub(): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    try {
      const response = await fetch(`${hubUrl}/api/v1/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Hub not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`E2E runtime timed out waiting for hub at ${hubUrl}`);
}

async function main(): Promise<void> {
  console.log(`E2E runtime: waiting for hub at ${hubUrl}`);
  await waitForHub();

  const tokenResponse = await fetch(`${hubUrl}/api/v1/admin/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nodeName: E2E_NODE_NAME, role: 'node' }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Failed to create node token: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as { token: string; nodeId: string };
  const agent = createE2EClientAgent({ id: tokenData.nodeId, name: E2E_NODE_NAME });
  const runtimeClient = new AgentRuntimeClient(agent, {
    hubUrl,
    websocketUrl: hubUrl.replace(/^http/, 'ws'),
    authToken: tokenData.token,
    nodeName: agent.name,
    heartbeatInterval: 5000,
    allowRemoteExecution: true,
    capabilityCacheDir: `${process.env.AGENTFORGE_DATA_DIR ?? '.agentforge'}/e2e-capabilities`,
    reconnect: { enabled: true, maxAttempts: 30, delayMs: 200, backoffMultiplier: 1 },
  });
  runtimeClient.on('error', (error) => {
    console.error('E2E runtime error', error);
  });

  console.log('E2E runtime: starting ClientAgent');
  await runtimeClient.start();
  console.log('E2E ClientAgent runtime started');

  const shutdown = async () => {
    await runtimeClient.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

main().catch((error) => {
  console.error('Failed to start E2E ClientAgent runtime', error);
  process.exit(1);
});
