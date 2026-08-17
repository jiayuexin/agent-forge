import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentResult, AgentTask, PluginCapability } from '@agentforge/types';
import type {
  CallContext,
  ExtismPluginOptions,
  ManifestLike,
  Plugin,
  PluginOutput,
} from '@extism/extism';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WasiPluginRunner,
  type ExtismPluginFactory,
  type WasiPluginExecutionContext,
} from '../WasiPluginRunner.js';

const fixturePath = fileURLToPath(new URL('../__fixtures__/count-vowels.wasm', import.meta.url));
const task: AgentTask = { type: 'plugin', input: { text: 'hello' } };

describe('WasiPluginRunner', () => {
  let artifact: Uint8Array;
  let trustStoreDir: string;
  let privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];

  beforeEach(async () => {
    artifact = await readFile(fixturePath);
    trustStoreDir = await mkdtemp(join(tmpdir(), 'agentforge-wasi-trust-'));
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = keyPair.privateKey;
    await writeFile(
      join(trustStoreDir, 'publisher-1.pem'),
      keyPair.publicKey.export({ type: 'spki', format: 'pem' })
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(trustStoreDir, { recursive: true, force: true });
  });

  it('executes a signed repository WASM fixture with constrained WASI settings', async () => {
    const capability = createCapability({
      signature: sign(artifact),
      entry: 'count_vowels',
      sandbox: { timeoutMs: 2_000, maxMemoryPages: 256 },
    });
    const runner = new WasiPluginRunner({
      trustStoreDir,
      artifactLoader: async () => artifact,
    });

    const result = await runner.execute(capability, task, createContext());

    expect(result).toMatchObject({
      success: true,
      meta: { model: 'wasi-plugin' },
    });
    expect(result.output.structured).toEqual(
      expect.objectContaining({ count: expect.any(Number) })
    );
  });

  it('passes worker, network, path, timeout, and memory restrictions to Extism', async () => {
    let receivedManifest: ManifestLike | undefined;
    let receivedOptions: ExtismPluginOptions | undefined;
    const factory = createFactory(async (manifest, options) => {
      receivedManifest = manifest;
      receivedOptions = options;
      return createFakePlugin();
    });
    const capability = createCapability({
      sandbox: { timeoutMs: 321, maxMemoryPages: 7 },
    });
    const runner = createRunner(factory);

    await runner.execute(capability, task, createContext());

    expect(receivedManifest).toMatchObject({
      allowedHosts: [],
      allowedPaths: {},
      timeoutMs: 321,
      memory: { maxPages: 7 },
    });
    expect(receivedOptions).toMatchObject({
      useWasi: true,
      runInWorker: true,
      allowedHosts: [],
      allowedPaths: {},
      timeoutMs: 321,
      memory: { maxPages: 7 },
      enableWasiOutput: false,
    });
  });

  it('allows the host function to call only a whitelisted capability asynchronously', async () => {
    const context = createContext();
    const capability = createCapability({
      allowedCapabilities: ['tool:allowed'],
    });
    const factory = createFactory(async (_manifest, options) =>
      createFakePlugin(async () => {
        const hostFunction = options?.functions?.agentforge?.callCapability;
        const callContext = createCallContext({
          capabilityId: 'tool:allowed',
          task: { type: 'plugin-host', input: { value: 1 } },
        });
        const address = await hostFunction?.(callContext.context, 1n);
        expect(address).toBe(2n);
        expect(callContext.stored).toEqual(expect.objectContaining({ success: true }));
        return pluginOutput({ ok: true });
      })
    );
    const runner = createRunner(factory);

    await runner.execute(capability, task, context);

    expect(context.executeCapability).toHaveBeenCalledWith('tool:allowed', {
      type: 'plugin-host',
      input: { value: 1 },
    });
  });

  it('rejects a host capability call outside the plugin whitelist', async () => {
    const factory = createFactory(async (_manifest, options) =>
      createFakePlugin(async () => {
        const hostFunction = options?.functions?.agentforge?.callCapability;
        const callContext = createCallContext({
          capabilityId: 'tool:denied',
          task: { type: 'plugin-host', input: {} },
        });
        await hostFunction?.(callContext.context, 1n);
        return pluginOutput({ unreachable: true });
      })
    );
    const runner = createRunner(factory);

    await expect(runner.execute(createCapability(), task, createContext())).rejects.toMatchObject({
      code: 'PLUGIN_CAPABILITY_NOT_ALLOWED',
    });
  });

  it('rejects missing exports and always closes the plugin instance', async () => {
    const plugin = createFakePlugin();
    vi.mocked(plugin.functionExists).mockResolvedValue(false);
    const runner = createRunner(createFactory(async () => plugin));

    await expect(runner.execute(createCapability(), task, createContext())).rejects.toMatchObject({
      code: 'PLUGIN_ENTRY_NOT_FOUND',
    });
    expect(plugin.close).toHaveBeenCalledOnce();
  });

  it('rejects invalid JSON output and closes a failing plugin instance', async () => {
    const plugin = createFakePlugin(async () => pluginOutputText('not-json'));
    const runner = createRunner(createFactory(async () => plugin));

    await expect(runner.execute(createCapability(), task, createContext())).rejects.toMatchObject({
      code: 'PLUGIN_OUTPUT_INVALID',
      details: undefined,
    });
    expect(plugin.close).toHaveBeenCalledOnce();
  });

  it('wraps runtime failures without exposing the original plugin error', async () => {
    const plugin = createFakePlugin(async () => {
      throw new Error('secret runtime internals');
    });
    const runner = createRunner(createFactory(async () => plugin));

    await expect(runner.execute(createCapability(), task, createContext())).rejects.toMatchObject({
      code: 'PLUGIN_EXECUTION_FAILED',
      message: 'Plugin "plugin:test" execution failed',
      details: undefined,
    });
    expect(plugin.close).toHaveBeenCalledOnce();
  });

  it('rejects task input that cannot be represented by the JSON ABI', async () => {
    const plugin = createFakePlugin();
    const runner = createRunner(createFactory(async () => plugin));

    await expect(
      runner.execute(
        createCapability(),
        { type: 'plugin', input: { missing: undefined } },
        createContext()
      )
    ).rejects.toMatchObject({ code: 'PLUGIN_INPUT_INVALID' });
    expect(plugin.call).not.toHaveBeenCalled();
    expect(plugin.close).toHaveBeenCalledOnce();
  });

  it('rejects a host capability result outside the JSON data model', async () => {
    const context = createContext();
    vi.mocked(context.executeCapability).mockResolvedValue({
      success: true,
      output: {
        content: 'invalid',
        structured: { result: Number.NaN },
      },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'test',
      },
    });
    const factory = createFactory(async (_manifest, options) =>
      createFakePlugin(async () => {
        const hostFunction = options?.functions?.agentforge?.callCapability;
        const callContext = createCallContext({
          capabilityId: 'tool:allowed',
          task: { type: 'plugin-host', input: {} },
        });
        await hostFunction?.(callContext.context, 1n);
        return pluginOutput({ unreachable: true });
      })
    );
    const runner = createRunner(factory);

    await expect(
      runner.execute(createCapability({ allowedCapabilities: ['tool:allowed'] }), task, context)
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_RESULT_INVALID' });
  });

  it.each([
    [{ timeoutMs: 0, maxMemoryPages: 1 }, 'PLUGIN_SANDBOX_INVALID'],
    [{ timeoutMs: 1, maxMemoryPages: 0 }, 'PLUGIN_SANDBOX_INVALID'],
  ] as const)('rejects invalid sandbox limits %o', async (sandbox, code) => {
    const runner = createRunner(createFactory(async () => createFakePlugin()));

    await expect(
      runner.execute(createCapability({ sandbox }), task, createContext())
    ).rejects.toMatchObject({ code });
  });

  it('rejects execution when Worker-backed WASI is unavailable', async () => {
    const runner = new WasiPluginRunner({
      artifactLoader: async () => artifact,
      verifyArtifact: async () => undefined,
      runtimeCapabilities: {
        hasWorkerCapability: false,
        supportsWasiPreview1: true,
      },
      pluginFactory: createFactory(async () => createFakePlugin()),
    });

    await expect(runner.execute(createCapability(), task, createContext())).rejects.toMatchObject({
      code: 'PLUGIN_WASI_UNAVAILABLE',
    });
  });

  it('wraps artifact download failures without exposing transport details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('private proxy credentials');
      })
    );
    const runner = new WasiPluginRunner({
      verifyArtifact: async () => undefined,
      pluginFactory: createFactory(async () => createFakePlugin()),
      runtimeCapabilities: {
        hasWorkerCapability: true,
        supportsWasiPreview1: true,
      },
    });

    await expect(runner.execute(createCapability(), task, createContext())).rejects.toMatchObject({
      code: 'PLUGIN_DOWNLOAD_FAILED',
      message: 'Failed to download plugin "plugin:test"',
      details: undefined,
    });
  });

  function sign(payload: Uint8Array): string {
    const signer = createSign('SHA256');
    signer.update(payload);
    signer.end();
    return signer.sign(privateKey, 'base64');
  }

  function createRunner(pluginFactory: ExtismPluginFactory): WasiPluginRunner {
    return new WasiPluginRunner({
      artifactLoader: async () => artifact,
      verifyArtifact: async () => undefined,
      pluginFactory,
      runtimeCapabilities: {
        hasWorkerCapability: true,
        supportsWasiPreview1: true,
      },
    });
  }
});

function createCapability(overrides: Partial<PluginCapability> = {}): PluginCapability {
  return {
    id: 'plugin:test',
    type: 'plugin',
    name: 'test-plugin',
    description: 'Test plugin',
    downloadUrl: 'https://example.com/plugin.wasm',
    signature: 'test-signature',
    keyId: 'publisher-1',
    entry: 'run',
    allowedCapabilities: [],
    sandbox: { timeoutMs: 1_000, maxMemoryPages: 8 },
    ...overrides,
  };
}

function createContext(): WasiPluginExecutionContext {
  return {
    executeCapability: vi.fn(
      async (): Promise<AgentResult> => ({
        success: true,
        output: { content: 'allowed', structured: { result: { ok: true } } },
        meta: {
          duration: 0,
          tokensUsed: { input: 0, output: 0, total: 0 },
          model: 'test',
        },
      })
    ),
  };
}

function createFactory(implementation: ExtismPluginFactory): ExtismPluginFactory {
  return vi.fn(implementation);
}

function createFakePlugin(
  call: Plugin['call'] = vi.fn(async () => pluginOutput({ ok: true }))
): Plugin {
  return {
    functionExists: vi.fn(async () => true),
    call: vi.fn(call),
    close: vi.fn(async () => undefined),
    getExports: vi.fn(async () => []),
    getImports: vi.fn(async () => []),
    getInstance: vi.fn(),
    isActive: vi.fn(() => false),
    reset: vi.fn(async () => true),
  };
}

function createCallContext(request: unknown): {
  context: CallContext;
  stored: unknown;
} {
  const state: { stored: unknown } = { stored: undefined };
  const context = {
    read: vi.fn(() => pluginOutput(request)),
    store: vi.fn((value: string) => {
      state.stored = JSON.parse(value);
      return 2n;
    }),
  } as unknown as CallContext;
  return {
    context,
    get stored() {
      return state.stored;
    },
  };
}

function pluginOutput(value: unknown): PluginOutput {
  return pluginOutputText(JSON.stringify(value));
}

function pluginOutputText(value: string): PluginOutput {
  return {
    text: () => value,
    json: () => JSON.parse(value),
  } as unknown as PluginOutput;
}
