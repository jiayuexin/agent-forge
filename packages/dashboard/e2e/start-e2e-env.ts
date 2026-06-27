import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { createE2EMockAgent } from './fixtures/mock-agent.js';

const dashboardDir = join(fileURLToPath(import.meta.url), '..', '..');
const pidFile = join(dashboardDir, '.e2e-mock-runtime.pid');
const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN ?? 'admin-token';
const e2ePort = process.env.AGENTFORGE_E2E_PORT ?? '8090';
const readyPort = process.env.AGENTFORGE_E2E_READY_PORT ?? '8092';
const hubUrl = `http://127.0.0.1:${e2ePort}`;

process.env.AGENTFORGE_HOST = process.env.AGENTFORGE_HOST ?? '127.0.0.1';
process.env.AGENTFORGE_PORT = process.env.AGENTFORGE_PORT ?? e2ePort;

let hubProcess: ChildProcess | undefined;
let runtimeClient: AgentRuntimeClient | undefined;
let readyServer: Server | undefined;

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

function spawnHub(): ChildProcess {
  return spawn('pnpm', ['run', 'dev:server'], {
    cwd: dashboardDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
}

async function waitForMockNode(timeoutMs = 90_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const nodesResponse = await fetch(`${hubUrl}/api/nodes`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const nodes = (await nodesResponse.json()) as Array<{ name: string }>;
    if (Array.isArray(nodes) && nodes.some((node) => node.name === 'E2E Mock Node')) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Mock node did not register');
}

async function startMockRuntime(nodeId: string, token: string): Promise<void> {
  const agent = createE2EMockAgent({ id: nodeId, name: 'E2E Mock Node' });
  runtimeClient = new AgentRuntimeClient(agent, {
    hubUrl,
    websocketUrl: hubUrl.replace(/^http/, 'ws'),
    authToken: token,
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
}

async function shutdown(): Promise<void> {
  if (readyServer) {
    await new Promise<void>((resolve) => readyServer!.close(() => resolve()));
  }
  if (runtimeClient) {
    await runtimeClient.stop();
  }
  if (hubProcess?.pid) {
    hubProcess.kill();
  }
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

hubProcess = spawnHub();
hubProcess.on('exit', (code) => {
  process.exit(code ?? 1);
});

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
await startMockRuntime(tokenData.nodeId, tokenData.token);
await waitForMockNode();

writeFileSync(join(dashboardDir, '.e2e-ready'), 'ready', 'utf-8');
readyServer = createServer((request, response) => {
  if (request.url === '/ready') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('ready');
    return;
  }
  response.writeHead(404);
  response.end();
});
await new Promise<void>((resolve, reject) => {
  readyServer!.listen(Number(readyPort), '127.0.0.1', () => resolve());
  readyServer!.once('error', reject);
});

console.log('E2E Hub and mock runtime are ready');

await new Promise(() => {});
