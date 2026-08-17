import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentStatus } from '@agentforge/types';
import type {
  AgentResult,
  AgentStreamChunk,
  IClientAgent,
  Logger,
  PluginCapability,
  SkillCapability,
  ToolCapability,
  ToolContext,
} from '@agentforge/types';
import { CachedCapabilitySource } from '../src/CachedCapabilitySource.js';
import { CapabilityCache } from '../src/CapabilityCache.js';

describe('cached capability execution integration', () => {
  let cacheDir: string;
  let trustStoreDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'agentforge-capability-execution-'));
    trustStoreDir = join(cacheDir, 'trust-keys');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('executes cached Tool and Skill definitions after reloading from disk', async () => {
    const tool: ToolCapability = {
      id: 'tool:add',
      type: 'tool',
      name: 'add',
      description: 'Add values',
      endpointType: 'local-function',
      endpoint: { target: 'math.add', method: 'call' },
      inputSchema: { type: 'object' },
    };
    const skill: SkillCapability = {
      id: 'skill:add',
      type: 'skill',
      name: 'add-skill',
      description: 'Use the add tool',
      tools: [tool.id],
      promptTemplate: 'Use only the add tool.',
      inputSchema: { type: 'object' },
    };
    const cache = new CapabilityCache({ cacheDir, trustStoreDir });
    await cache.install({ action: 'add', capability: tool });
    await cache.install({ action: 'add', capability: skill });

    const reloaded = new CapabilityCache({ cacheDir, trustStoreDir });
    await reloaded.load();
    const agent = createAgent();
    vi.mocked(agent.executeScopedTask).mockImplementation(async (task, options) => {
      expect(options.tools.map((item) => item.name)).toEqual([tool.name]);
      const value = await options.tools[0].handler!(task.input, {} as ToolContext);
      return success('skill complete', { result: value });
    });
    const source = new CachedCapabilitySource({
      cache: reloaded,
      agent,
      logger: createLogger(),
      adapters: {
        'local-function': async (_definition, args) => ({
          total: Number(args.left) + Number(args.right),
        }),
      },
    });

    await expect(
      source.executeCapability(tool.id, {
        type: 'tool',
        input: { left: 2, right: 3 },
      })
    ).resolves.toMatchObject({
      output: { structured: { result: { total: 5 } } },
    });
    await expect(
      source.executeCapability(skill.id, {
        type: 'skill',
        input: { left: 4, right: 5 },
      })
    ).resolves.toMatchObject({
      output: { structured: { result: { total: 9 } } },
    });
  });

  it('executes a signed cached WASI Plugin after restart without downloading again', async () => {
    const fixture = await readFile(
      fileURLToPath(
        new URL('../../core/src/plugin/__fixtures__/count-vowels.wasm', import.meta.url)
      )
    );
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    await writeFile(
      join(cacheDir, 'publisher.pem'),
      publicKey.export({ type: 'spki', format: 'pem' })
    );
    const signer = createSign('SHA256');
    signer.update(fixture);
    signer.end();
    const capability: PluginCapability = {
      id: 'plugin:count-vowels',
      type: 'plugin',
      name: 'count-vowels',
      description: 'Count vowels',
      downloadUrl: 'https://example.com/count-vowels.wasm',
      signature: signer.sign(privateKey, 'base64'),
      keyId: 'publisher',
      entry: 'count_vowels',
      allowedCapabilities: [],
      sandbox: { timeoutMs: 2_000, maxMemoryPages: 256 },
      inputSchema: { type: 'object' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fixture))
    );
    const cache = new CapabilityCache({
      cacheDir,
      trustStoreDir: cacheDir,
    });
    await expect(cache.install({ action: 'add', capability })).resolves.toMatchObject({
      status: 'installed',
    });

    const reloaded = new CapabilityCache({
      cacheDir,
      trustStoreDir: cacheDir,
    });
    await reloaded.load();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    const source = new CachedCapabilitySource({
      cache: reloaded,
      agent: createAgent(),
      logger: createLogger(),
      adapters: {},
    });

    await expect(
      source.executeCapability(capability.id, {
        type: 'plugin',
        input: { text: 'hello' },
      })
    ).resolves.toMatchObject({
      success: true,
      output: {
        structured: expect.objectContaining({ count: expect.any(Number) }),
      },
    });
  });
});

function createAgent(): IClientAgent {
  return {
    id: 'client',
    name: 'client',
    role: 'client',
    version: '1.0.0',
    capabilities: [],
    status: AgentStatus.READY,
    init: vi.fn(async () => undefined),
    execute: vi.fn(async () => success('agent')),
    stream: async function* (): AsyncIterable<AgentStreamChunk> {},
    destroy: vi.fn(async () => undefined),
    on() {
      return this;
    },
    off() {
      return this;
    },
    startDaemon: vi.fn(async () => undefined),
    stopDaemon: vi.fn(async () => undefined),
    connectToHub: vi.fn(async () => undefined),
    disconnectFromHub: vi.fn(async () => undefined),
    getLocalCapabilityCache: vi.fn(() => []),
    setCapabilitySource: vi.fn(),
    executeLocalCapability: vi.fn(async () => success('local')),
    executeScopedTask: vi.fn(async () => success('scoped')),
    authorizeLocalCommand: vi.fn(async () => undefined),
    getLocalCommandAuthorization: vi.fn(() => 'disabled'),
  };
}

function createLogger(): Logger {
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return logger;
}

function success(content: string, structured?: Record<string, unknown>): AgentResult {
  return {
    success: true,
    output: { content, structured },
    meta: {
      duration: 0,
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'test',
    },
  };
}
