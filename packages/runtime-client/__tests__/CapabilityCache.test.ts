import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign as signPayload } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CapabilityCache } from '../src/CapabilityCache.js';
import type {
  CapabilityDistributePayload,
  PluginCapability,
  ToolCapability,
} from '@agentforge/types';

const TEST_CACHE_DIR = join(process.cwd(), 'tmp-test-capabilities');
const TOOL_CONTRACT = {
  endpointType: 'local-command',
  endpoint: {
    target: 'git status --porcelain',
    method: 'exec',
  },
  inputSchema: { type: 'object' },
} satisfies Pick<ToolCapability, 'endpointType' | 'endpoint' | 'inputSchema'>;

describe('CapabilityCache', () => {
  let cache: CapabilityCache;

  beforeEach(async () => {
    await rm(TEST_CACHE_DIR, { recursive: true, force: true });
    cache = new CapabilityCache({ cacheDir: TEST_CACHE_DIR });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(TEST_CACHE_DIR, { recursive: true, force: true });
  });

  it('load creates cache directory and returns empty list when no manifest exists', async () => {
    const capabilities = await cache.load();
    expect(capabilities).toEqual([]);
    expect(cache.list()).toEqual([]);
  });

  it('install writes definition and manifest', async () => {
    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-git-status',
        type: 'tool',
        name: 'git-status',
        description: 'Show git status',
        version: '1.0.0',
      },
    };

    const ack = await cache.install(payload);
    expect(ack.status).toBe('installed');
    expect(ack.capabilityId).toBe('tool-git-status');
    expect(ack.installedVersion).toBe('1.0.0');

    const loaded = await cache.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('tool-git-status');
  });

  it('update overwrites existing capability', async () => {
    const addPayload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-git-status',
        type: 'tool',
        name: 'git-status',
        description: 'Show git status',
        version: '1.0.0',
      },
    };

    await cache.install(addPayload);

    const updatePayload: CapabilityDistributePayload = {
      action: 'update',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-git-status',
        type: 'tool',
        name: 'git-status',
        description: 'Show git status v2',
        version: '1.1.0',
      },
    };

    const ack = await cache.update(updatePayload);
    expect(ack.status).toBe('installed');
    expect(ack.installedVersion).toBe('1.1.0');

    const loaded = await cache.load();
    expect(loaded[0].description).toBe('Show git status v2');
  });

  it('remove deletes capability and updates manifest', async () => {
    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-git-status',
        type: 'tool',
        name: 'git-status',
        description: 'Show git status',
        version: '1.0.0',
      },
    };

    await cache.install(payload);
    expect(cache.has('tool-git-status')).toBe(true);

    const ack = await cache.remove('tool-git-status');
    expect(ack.status).toBe('installed');
    expect(cache.has('tool-git-status')).toBe(false);

    const loaded = await cache.load();
    expect(loaded).toHaveLength(0);
  });

  it('install plugin reads download metadata from the plugin capability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        id: 'plugin-logger',
        type: 'plugin',
        name: 'logger',
        description: 'Logger plugin',
        version: '0.1.0',
        downloadUrl: 'https://example.com/plugin.wasm',
        signature: 'fake-signature',
        keyId: 'key-1',
        entry: 'run',
        allowedCapabilities: [],
        sandbox: {
          timeoutMs: 30_000,
          maxMemoryPages: 256,
        },
      },
    };

    const ack = await cache.install(payload);
    expect(ack.status).toBe('failed');
    expect(ack.error).toBeDefined();
  });

  it('verifies a plugin with the capability keyId', async () => {
    const packageBytes = Buffer.from('signed plugin package');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const trustStoreDir = join(TEST_CACHE_DIR, 'trust-keys');
    await mkdir(trustStoreDir, { recursive: true });
    await writeFile(
      join(trustStoreDir, 'release-key.pem'),
      publicKey.export({ type: 'spki', format: 'pem' })
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(packageBytes)));
    cache = new CapabilityCache({ cacheDir: TEST_CACHE_DIR, trustStoreDir });

    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        id: 'plugin-signed',
        type: 'plugin',
        name: 'signed-plugin',
        description: 'Plugin signed by a named key',
        version: '1.0.0',
        downloadUrl: 'https://example.com/plugin.wasm',
        signature: signPayload('SHA256', packageBytes, privateKey).toString('base64'),
        keyId: 'release-key',
        entry: 'run',
        allowedCapabilities: [],
        sandbox: {
          timeoutMs: 30_000,
          maxMemoryPages: 256,
        },
      },
    };

    const ack = await cache.install(payload);

    expect(ack.status).toBe('installed');
    expect(ack.capabilityId).toBe('plugin-signed');
    await expect(cache.readPluginArtifact('plugin-signed')).resolves.toEqual(packageBytes);
  });

  it('keeps an installed plugin unchanged when an update signature is invalid', async () => {
    const oldPackage = Buffer.from('signed plugin package v1');
    const newPackage = Buffer.from('tampered plugin package v2');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const trustStoreDir = join(TEST_CACHE_DIR, 'trust-keys');
    await mkdir(trustStoreDir, { recursive: true });
    await writeFile(
      join(trustStoreDir, 'release-key.pem'),
      publicKey.export({ type: 'spki', format: 'pem' })
    );
    const oldSignature = signPayload('SHA256', oldPackage, privateKey).toString('base64');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(oldPackage))
      .mockResolvedValueOnce(new Response(newPackage));
    vi.stubGlobal('fetch', fetchMock);
    cache = new CapabilityCache({ cacheDir: TEST_CACHE_DIR, trustStoreDir });

    const oldCapability = {
      id: 'plugin-transactional',
      type: 'plugin',
      name: 'transactional-plugin',
      description: 'Installed plugin',
      version: '1.0.0',
      downloadUrl: 'https://example.com/plugin-v1.tgz',
      signature: oldSignature,
      keyId: 'release-key',
      entry: 'run',
      allowedCapabilities: [],
      sandbox: {
        timeoutMs: 30_000,
        maxMemoryPages: 256,
      },
    } satisfies PluginCapability;

    expect(
      await cache.install({
        action: 'add',
        capability: oldCapability,
      })
    ).toMatchObject({ status: 'installed', installedVersion: '1.0.0' });

    const failedUpdate = await cache.update({
      action: 'update',
      capability: {
        ...oldCapability,
        description: 'Tampered update',
        version: '2.0.0',
        downloadUrl: 'https://example.com/plugin-v2.tgz',
      },
    });

    expect(failedUpdate.status).toBe('failed');
    expect(cache.get(oldCapability.id)).toEqual(oldCapability);
    expect(
      JSON.parse(await readFile(join(TEST_CACHE_DIR, oldCapability.id, 'definition.json'), 'utf-8'))
    ).toEqual(oldCapability);
    expect(await readFile(join(TEST_CACHE_DIR, oldCapability.id, 'plugin.wasm'))).toEqual(
      oldPackage
    );
    expect(await readFile(join(TEST_CACHE_DIR, oldCapability.id, 'signature.txt'), 'utf-8')).toBe(
      oldSignature
    );
    expect(
      JSON.parse(await readFile(join(TEST_CACHE_DIR, 'manifest.json'), 'utf-8')).capabilities[
        oldCapability.id
      ].version
    ).toBe('1.0.0');

    const reloadedCache = new CapabilityCache({ cacheDir: TEST_CACHE_DIR, trustStoreDir });
    await reloadedCache.load();
    expect(reloadedCache.get(oldCapability.id)).toEqual(oldCapability);
  });

  it('load rejects a cached plugin whose WASM bytes no longer match its signature', async () => {
    const packageBytes = Buffer.from('signed plugin');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const trustStoreDir = join(TEST_CACHE_DIR, 'trust-keys');
    await mkdir(trustStoreDir, { recursive: true });
    await writeFile(
      join(trustStoreDir, 'release-key.pem'),
      publicKey.export({ type: 'spki', format: 'pem' })
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(packageBytes))
    );
    cache = new CapabilityCache({ cacheDir: TEST_CACHE_DIR, trustStoreDir });
    const capability: PluginCapability = {
      id: 'plugin-tampered',
      type: 'plugin',
      name: 'tampered',
      description: 'Tamper test',
      downloadUrl: 'https://example.com/plugin.wasm',
      signature: signPayload('SHA256', packageBytes, privateKey).toString('base64'),
      keyId: 'release-key',
      entry: 'run',
      allowedCapabilities: [],
      sandbox: { timeoutMs: 1_000, maxMemoryPages: 8 },
    };
    expect(await cache.install({ action: 'add', capability })).toMatchObject({
      status: 'installed',
    });
    await writeFile(
      join(TEST_CACHE_DIR, capability.id, 'plugin.wasm'),
      Buffer.from('tampered bytes')
    );

    const reloaded = new CapabilityCache({ cacheDir: TEST_CACHE_DIR, trustStoreDir });
    await expect(reloaded.load()).resolves.toEqual([]);
    expect(reloaded.has(capability.id)).toBe(false);
  });

  it('rejects a capability id that traverses outside the cache directory', async () => {
    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: '../outside',
        type: 'tool',
        name: 'outside',
        description: 'Invalid path',
      },
    };

    await expect(cache.install(payload)).resolves.toMatchObject({
      status: 'failed',
    });
    expect(cache.has(payload.capability.id)).toBe(false);
  });

  it('get and has return correct values after load', async () => {
    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-git-status',
        type: 'tool',
        name: 'git-status',
        description: 'Show git status',
        version: '1.0.0',
      },
    };

    await cache.install(payload);
    expect(cache.has('tool-git-status')).toBe(true);
    expect(cache.get('tool-git-status')?.name).toBe('git-status');

    const loaded = await cache.load();
    expect(loaded).toHaveLength(1);
    expect(cache.has('tool-git-status')).toBe(true);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('load skips missing definition files and logs error', async () => {
    await cache.load();
    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-a',
        type: 'tool',
        name: 'a',
        description: 'A',
        version: '1.0.0',
      },
    };
    await cache.install(payload);

    // Corrupt the cache by deleting the definition file while keeping the manifest entry.
    await rm(join(TEST_CACHE_DIR, 'tool-a', 'definition.json'), { force: true });

    const loaded = await cache.load();
    expect(loaded).toHaveLength(0);
  });

  it('load rejects a definition whose id does not match its manifest entry', async () => {
    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-a',
        type: 'tool',
        name: 'a',
        description: 'A',
      },
    };
    await cache.install(payload);
    await writeFile(
      join(TEST_CACHE_DIR, 'tool-a', 'definition.json'),
      JSON.stringify({ ...payload.capability, id: 'tool-b' })
    );

    await expect(cache.load()).resolves.toEqual([]);
    expect(cache.has('tool-a')).toBe(false);
    expect(cache.has('tool-b')).toBe(false);
  });

  it('install with backup preserves existing files', async () => {
    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-versioned',
        type: 'tool',
        name: 'versioned',
        description: 'v1',
        version: '1.0.0',
      },
    };

    await cache.install(payload);
    const updatePayload: CapabilityDistributePayload = {
      action: 'update',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-versioned',
        type: 'tool',
        name: 'versioned',
        description: 'v2',
        version: '2.0.0',
      },
    };

    const ack = await cache.update(updatePayload, { backup: true });
    expect(ack.status).toBe('installed');
    expect(cache.get('tool-versioned')?.description).toBe('v2');
  });

  it('failed install returns failed ack with error', async () => {
    await rm(TEST_CACHE_DIR, { recursive: true, force: true });
    await writeFile(TEST_CACHE_DIR, 'not a directory');

    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        ...TOOL_CONTRACT,
        id: 'tool-invalid',
        type: 'tool',
        name: 'invalid',
        description: 'Invalid',
        version: '1.0.0',
      },
    };

    const ack = await cache.install(payload);
    expect(ack.status).toBe('failed');
    expect(ack.error).toBeDefined();
  });
});
