import { writeFileSync } from 'node:fs';
import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { createE2EClientAgent, E2E_NODE_NAME } from './e2e-agent.js';

const hubUrl = process.env.AGENTFORGE_HUB_URL ?? 'http://localhost:8080';
const authToken = process.env.E2E_NODE_TOKEN;
const nodeId = process.env.E2E_NODE_ID ?? 'e2e-client-agent';
const pidFile = process.env.E2E_MOCK_RUNTIME_PID_FILE;

if (!authToken) {
  console.error('E2E_NODE_TOKEN is required');
  process.exit(1);
}

const agent = createE2EClientAgent({ id: nodeId, name: E2E_NODE_NAME });
const client = new AgentRuntimeClient(agent, {
  hubUrl,
  websocketUrl: hubUrl.replace(/^http/, 'ws'),
  authToken,
  nodeName: agent.name,
  heartbeatInterval: 5000,
  allowRemoteExecution: true,
  reconnect: { enabled: true, maxAttempts: 30, delayMs: 200, backoffMultiplier: 1 },
});

await client.start();
console.log(`E2E ClientAgent connected as ${nodeId}`);

client.on('error', (error) => {
  console.error('E2E runtime error', error);
});

if (pidFile) {
  writeFileSync(pidFile, String(process.pid), 'utf-8');
}

async function shutdown() {
  await client.stop();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
