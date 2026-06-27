import { createHubServer, type HubServer } from '../server/index.js';
import type { AgentRuntimeConfig } from '@agentforge/types';

export async function startTestHub(options: { dataDir?: string } = {}): Promise<{
  hub: HubServer;
  port: number;
  adminToken: string;
}> {
  const adminToken = `test-admin-${Date.now()}`;
  const hub = await createHubServer({
    port: 0,
    host: '127.0.0.1',
    dataDir: options.dataDir,
    adminToken,
  });

  await new Promise<void>((resolve, reject) => {
    hub.server.once('error', reject);
    hub.server.once('listening', () => {
      hub.server.off('error', reject);
      resolve();
    });
    hub.server.listen(0, '127.0.0.1');
  });

  const address = hub.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { hub, port, adminToken };
}

export async function requestJson(
  port: number,
  path: string,
  adminToken: string,
  init?: RequestInit
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${adminToken}`,
    ...(init?.headers as Record<string, string>),
  };
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers });
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function buildRuntimeConfig(port: number, overrides: Partial<AgentRuntimeConfig> = {}): AgentRuntimeConfig {
  return {
    hubUrl: `http://127.0.0.1:${port}`,
    websocketUrl: `ws://127.0.0.1:${port}`,
    heartbeatInterval: 5000,
    ...overrides,
  };
}
