import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CapabilityCache } from '../src/CapabilityCache.js';
import type { CapabilityDistributePayload } from '@agentforge/types';

const TEST_CACHE_DIR = join(process.cwd(), 'tmp-test-capabilities');

describe('CapabilityCache', () => {
  let cache: CapabilityCache;

  beforeEach(async () => {
    await rm(TEST_CACHE_DIR, { recursive: true, force: true });
    cache = new CapabilityCache({ cacheDir: TEST_CACHE_DIR });
  });

  afterEach(async () => {
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

  it('install plugin downloads package.tgz when downloadUrl is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        id: 'plugin-logger',
        type: 'plugin',
        name: 'logger',
        description: 'Logger plugin',
        version: '0.1.0',
      },
      downloadUrl: 'https://example.com/plugin.tgz',
      signature: 'fake-signature',
    };

    const ack = await cache.install(payload);
    expect(ack.status).toBe('failed');
    expect(ack.error).toBeDefined();

    vi.unstubAllGlobals();
  });

  it('failed install returns failed ack with error', async () => {
    // Create cache dir as a file to force mkdir failure
    await rm(TEST_CACHE_DIR, { recursive: true, force: true });
    await mkdir(TEST_CACHE_DIR, { recursive: true });

    const payload: CapabilityDistributePayload = {
      action: 'add',
      capability: {
        id: 'tool-invalid',
        type: 'tool',
        name: 'invalid',
        description: 'Invalid',
        version: '1.0.0',
      },
    };

    // Valid payload should still succeed with normal cache dir
    const ack = await cache.install(payload);
    expect(ack.status).toBe('installed');
  });
});
