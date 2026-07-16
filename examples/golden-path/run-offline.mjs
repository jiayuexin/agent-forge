#!/usr/bin/env node
/**
 * US8 offline proof: Hub unreachable + already-cached Tool still executes.
 * Requires: pnpm build (uses packages/<pkg>/dist).
 * No live Hub / LLM. Failures exit 1 immediately (no retry / fallback).
 */
import { createConnection } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AgentStatus } from '../../packages/types/dist/index.js';

const exampleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(exampleDir, '../..');
const fixturePath = join(exampleDir, 'fixtures/tool-echo.json');
/** Intentionally closed port — Hub must be unreachable for this proof. */
const HUB_HOST = '127.0.0.1';
const HUB_PORT = 1;
const HUB_URL = `http://${HUB_HOST}:${HUB_PORT}`;

const { AgentRuntimeClient, CapabilityCache } = await import(
  pathToFileURL(join(repoRoot, 'packages/runtime-client/dist/index.js')).href
);

const cacheDir = await mkdtemp(join(tmpdir(), 'agentforge-offline-'));
const trustStoreDir = join(cacheDir, 'trust-keys');
let client;

try {
  await assertHubUnreachable(HUB_HOST, HUB_PORT);
  console.log(`HUB_UNREACHABLE ${HUB_HOST}:${HUB_PORT}`);

  const capability = JSON.parse(await readFile(fixturePath, 'utf-8'));
  const cache = new CapabilityCache({ cacheDir, trustStoreDir });
  const ack = await cache.install({ action: 'add', capability });
  if (ack.status !== 'installed') {
    throw new Error(`Capability install failed: ${JSON.stringify(ack)}`);
  }

  client = new AgentRuntimeClient(createDemoAgent(), {
    hubUrl: HUB_URL,
    capabilityCacheDir: cacheDir,
    capabilityTrustStoreDir: trustStoreDir,
    reconnect: {
      enabled: false,
      maxAttempts: 1,
      delayMs: 10,
      backoffMultiplier: 1,
    },
  });
  // Observe expected Hub-down transport errors (EventEmitter requires a listener).
  client.on('error', () => undefined);

  // Normal path after prior Hub sync: load local cache inside start(), then Hub connect fails.
  await expectStartFailsBecauseHubDown(client);
  if (client.status === 'connected') {
    throw new Error(`Expected runtime not connected, got status=${client.status}`);
  }
  console.log(`RUNTIME_NOT_CONNECTED status=${client.status}`);

  const result = await client.executeCapability(capability.id, {
    type: 'tool',
    input: {},
  });

  if (!result.success) {
    throw new Error(`Offline Tool execution failed: ${JSON.stringify(result)}`);
  }

  const payload = JSON.stringify(result.output?.structured ?? result.output ?? {});
  console.log(`tool result: ${payload}`);
  if (!payload.includes('hello-agentforge')) {
    throw new Error(`Expected hello-agentforge in result, got: ${payload}`);
  }

  console.log('OFFLINE_CAPABILITY_OK');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (client) {
    await client.stop();
  }
  await rm(cacheDir, { recursive: true, force: true });
}

async function assertHubUnreachable(host, port) {
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const failOpen = () => {
      socket.destroy();
      reject(new Error(`Hub unexpectedly reachable at ${host}:${port}`));
    };
    const okClosed = () => {
      socket.destroy();
      resolve();
    };
    socket.setTimeout(500);
    socket.once('connect', failOpen);
    socket.once('timeout', okClosed);
    socket.once('error', okClosed);
  });
}

async function expectStartFailsBecauseHubDown(runtimeClient) {
  let failed = false;
  try {
    await runtimeClient.start();
  } catch {
    failed = true;
  }
  if (!failed) {
    throw new Error('Expected AgentRuntimeClient.start() to fail when Hub is unreachable');
  }
}

function createDemoAgent() {
  return {
    id: 'offline-capability-demo',
    name: 'offline-capability-demo',
    role: 'demo',
    version: '0.0.0',
    capabilities: [],
    status: AgentStatus.READY,
    init: async () => undefined,
    execute: async () => success('unused'),
    stream: async function* () {},
    destroy: async () => undefined,
    on() {
      return this;
    },
    off() {
      return this;
    },
    startDaemon: async () => undefined,
    stopDaemon: async () => undefined,
    connectToHub: async () => undefined,
    disconnectFromHub: async () => undefined,
    getLocalCapabilityCache: () => [],
    setCapabilitySource: () => undefined,
    executeLocalCapability: async () => success('unused'),
    executeScopedTask: async () => success('unused'),
    authorizeLocalCommand: async () => undefined,
    getLocalCommandAuthorization: () => 'allow-all',
  };
}

function success(content) {
  return {
    success: true,
    output: { content },
    meta: {
      duration: 0,
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'none',
    },
  };
}
