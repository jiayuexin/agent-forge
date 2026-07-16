#!/usr/bin/env node
/**
 * Golden-path local demo: install a Tool fixture into CapabilityCache and execute it.
 * Requires: pnpm build (uses packages/<pkg>/dist).
 * No Hub / LLM required for this path.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AgentStatus } from '../../packages/types/dist/index.js';

const exampleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(exampleDir, '../..');
const fixturePath = join(exampleDir, 'fixtures/tool-echo.json');

const { CapabilityCache, CachedCapabilitySource, createRuntimeToolAdapters } = await import(
  pathToFileURL(join(repoRoot, 'packages/runtime-client/dist/index.js')).href
);

const cacheDir = await mkdtemp(join(tmpdir(), 'agentforge-golden-path-'));
const trustStoreDir = join(cacheDir, 'trust-keys');

try {
  const capability = JSON.parse(await readFile(fixturePath, 'utf-8'));
  const cache = new CapabilityCache({ cacheDir, trustStoreDir });
  const ack = await cache.install({ action: 'add', capability });
  if (ack.status !== 'installed') {
    throw new Error(`Capability install failed: ${JSON.stringify(ack)}`);
  }

  const reloaded = new CapabilityCache({ cacheDir, trustStoreDir });
  await reloaded.load();

  const agent = createDemoAgent();
  const source = new CachedCapabilitySource({
    cache: reloaded,
    agent,
    logger: consoleLogger(),
    adapters: createRuntimeToolAdapters(agent),
  });

  const result = await source.executeCapability(capability.id, {
    type: 'tool',
    input: {},
  });

  if (!result.success) {
    throw new Error(`Tool execution failed: ${JSON.stringify(result)}`);
  }

  const payload = JSON.stringify(result.output?.structured ?? result.output ?? {});
  console.log(`tool result: ${payload}`);
  if (!payload.includes('hello-agentforge')) {
    throw new Error(`Expected hello-agentforge in result, got: ${payload}`);
  }

  console.log('GOLDEN_PATH_OK');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await rm(cacheDir, { recursive: true, force: true });
}

function createDemoAgent() {
  return {
    id: 'golden-path-demo',
    name: 'golden-path-demo',
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

function consoleLogger() {
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    child: () => logger,
  };
  return logger;
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
