import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { createE2EMockAgent } from './mock-agent.js';

const hubUrl = process.env.AGENTFORGE_HUB_URL ?? 'http://localhost:8080';
const authToken = process.env.E2E_NODE_TOKEN;
const nodeId = process.env.E2E_NODE_ID ?? 'e2e-mock-agent';
const pidFile = process.env.E2E_MOCK_RUNTIME_PID_FILE;

if (!authToken) {
  console.error('E2E_NODE_TOKEN is required');
  process.exit(1);
}

const agent = createE2EMockAgent({ id: nodeId, name: 'E2E Mock Node' });
const client = new AgentRuntimeClient(agent, {
  hubUrl,
  websocketUrl: hubUrl.replace(/^http/, 'ws'),
  authToken,
  nodeName: agent.name,
  heartbeatInterval: 5000,
  allowRemoteExecution: true,
});

await client.start();
console.log(`Mock runtime connected as ${nodeId}`);

client.on('error', (error) => {
  console.error('Mock runtime error', error);
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
