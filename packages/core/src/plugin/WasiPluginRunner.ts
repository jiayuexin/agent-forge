import type {
  CallContext,
  ExtismPluginOptions,
  Manifest,
  ManifestLike,
  Plugin,
} from '@extism/extism';
import type { AgentResult, AgentTask, PluginCapability } from '@agentforge/types';
import { CoreError } from '../errors.js';
import { serializeJsonValue } from '../runtime/JsonValue.js';
import {
  verifyPluginArtifact,
  type PluginArtifactVerifierOptions,
} from './PluginArtifactVerifier.js';

export type ExtismPluginFactory = (
  manifest: ManifestLike | PromiseLike<ManifestLike>,
  options?: ExtismPluginOptions
) => Promise<Plugin>;

export interface WasiPluginExecutionContext {
  executeCapability(capabilityId: string, task: AgentTask): Promise<AgentResult>;
}

export interface WasiRuntimeCapabilities {
  hasWorkerCapability: boolean;
  supportsWasiPreview1: boolean;
}

export type PluginArtifactLoader = (capability: PluginCapability) => Promise<Uint8Array>;

export type PluginArtifactVerifier = (
  capability: PluginCapability,
  artifact: Uint8Array
) => Promise<void>;

export interface WasiPluginRunnerOptions extends PluginArtifactVerifierOptions {
  artifactLoader?: PluginArtifactLoader;
  verifyArtifact?: PluginArtifactVerifier;
  pluginFactory?: ExtismPluginFactory;
  runtimeCapabilities?: WasiRuntimeCapabilities;
}

export class WasiPluginRunner {
  private readonly artifactLoader: PluginArtifactLoader;
  private readonly verifyArtifact: PluginArtifactVerifier;
  private readonly pluginFactory: ExtismPluginFactory;
  private readonly loadRuntimeCapabilities: () => Promise<WasiRuntimeCapabilities>;

  constructor(options: WasiPluginRunnerOptions = {}) {
    this.artifactLoader = options.artifactLoader ?? loadPluginArtifact;
    this.verifyArtifact =
      options.verifyArtifact ??
      ((capability, artifact) =>
        verifyPluginArtifact(capability, artifact, {
          trustStoreDir: options.trustStoreDir,
        }));
    this.pluginFactory = options.pluginFactory ?? createExtismPlugin;
    this.loadRuntimeCapabilities = options.runtimeCapabilities
      ? async () => options.runtimeCapabilities!
      : loadExtismRuntimeCapabilities;
  }

  async execute(
    capability: PluginCapability,
    task: AgentTask,
    context: WasiPluginExecutionContext
  ): Promise<AgentResult> {
    this.assertRuntimeAvailable(capability, await this.loadRuntimeCapabilities());
    this.assertSandbox(capability);
    const artifact = await this.artifactLoader(capability);
    await this.verifyArtifact(capability, artifact);

    const startedAt = Date.now();
    const extismOptions = this.createExtismOptions(capability, context);
    const manifest: Manifest = {
      wasm: [{ data: artifact }],
      allowedHosts: [],
      allowedPaths: {},
      timeoutMs: capability.sandbox.timeoutMs,
      memory: { maxPages: capability.sandbox.maxMemoryPages },
    };
    const plugin = await this.pluginFactory(manifest, extismOptions);

    try {
      if (!(await plugin.functionExists(capability.entry))) {
        throw new CoreError(
          'PLUGIN_ENTRY_NOT_FOUND',
          `Plugin "${capability.id}" does not export "${capability.entry}"`
        );
      }
      const input = serializeJson(
        { version: '1', capabilityId: capability.id, task },
        'PLUGIN_INPUT_INVALID',
        `Plugin "${capability.id}" input is not valid JSON`
      );
      const output = await plugin.call(capability.entry, input);
      if (!output) {
        throw new CoreError(
          'PLUGIN_OUTPUT_INVALID',
          `Plugin "${capability.id}" returned no JSON output`
        );
      }
      const parsed = parseJson(
        output.text(),
        'PLUGIN_OUTPUT_INVALID',
        `Plugin "${capability.id}" returned invalid JSON`
      );
      return {
        success: true,
        output: {
          content: typeof parsed === 'string' ? parsed : JSON.stringify(parsed),
          structured: isRecord(parsed) ? parsed : { result: parsed },
        },
        meta: {
          duration: Date.now() - startedAt,
          tokensUsed: { input: 0, output: 0, total: 0 },
          model: 'wasi-plugin',
        },
      };
    } catch (error) {
      if (error instanceof CoreError) throw error;
      throw new CoreError('PLUGIN_EXECUTION_FAILED', `Plugin "${capability.id}" execution failed`);
    } finally {
      await plugin.close();
    }
  }

  private createExtismOptions(
    capability: PluginCapability,
    context: WasiPluginExecutionContext
  ): ExtismPluginOptions {
    const allowedCapabilities = new Set(capability.allowedCapabilities);
    return {
      useWasi: true,
      runInWorker: true,
      allowedHosts: [],
      allowedPaths: {},
      timeoutMs: capability.sandbox.timeoutMs,
      memory: { maxPages: capability.sandbox.maxMemoryPages },
      enableWasiOutput: false,
      functions: {
        agentforge: {
          callCapability: async (callContext: CallContext, requestAddress: bigint) => {
            const requestOutput = callContext.read(requestAddress);
            if (!requestOutput) {
              throw new CoreError(
                'PLUGIN_HOST_REQUEST_INVALID',
                `Plugin "${capability.id}" supplied an invalid host request address`
              );
            }
            const request = parseHostRequest(requestOutput.text(), capability.id);
            if (!allowedCapabilities.has(request.capabilityId)) {
              throw new CoreError(
                'PLUGIN_CAPABILITY_NOT_ALLOWED',
                `Plugin "${capability.id}" cannot call capability "${request.capabilityId}"`
              );
            }
            const result = await context.executeCapability(request.capabilityId, request.task);
            const serialized = serializeJson(
              result,
              'PLUGIN_HOST_RESULT_INVALID',
              `Capability "${request.capabilityId}" returned a non-JSON result`
            );
            return callContext.store(serialized);
          },
        },
      },
    };
  }

  private assertRuntimeAvailable(
    capability: PluginCapability,
    runtimeCapabilities: WasiRuntimeCapabilities
  ): void {
    if (!runtimeCapabilities.hasWorkerCapability || !runtimeCapabilities.supportsWasiPreview1) {
      throw new CoreError(
        'PLUGIN_WASI_UNAVAILABLE',
        `Worker-backed WASI is unavailable for plugin "${capability.id}"`
      );
    }
  }

  private assertSandbox(capability: PluginCapability): void {
    const { timeoutMs, maxMemoryPages } = capability.sandbox;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      !Number.isInteger(maxMemoryPages) ||
      maxMemoryPages <= 0
    ) {
      throw new CoreError(
        'PLUGIN_SANDBOX_INVALID',
        `Plugin "${capability.id}" requires positive integer sandbox limits`
      );
    }
    if (!capability.entry.trim()) {
      throw new CoreError(
        'PLUGIN_ENTRY_INVALID',
        `Plugin "${capability.id}" must declare an exported entry function`
      );
    }
  }
}

async function createExtismPlugin(
  manifest: ManifestLike | PromiseLike<ManifestLike>,
  options?: ExtismPluginOptions
): Promise<Plugin> {
  const { default: factory } = await import('@extism/extism');
  return factory(manifest, options);
}

async function loadExtismRuntimeCapabilities(): Promise<WasiRuntimeCapabilities> {
  const { CAPABILITIES } = await import('@extism/extism');
  return {
    hasWorkerCapability: CAPABILITIES.hasWorkerCapability,
    supportsWasiPreview1: CAPABILITIES.supportsWasiPreview1,
  };
}

async function loadPluginArtifact(capability: PluginCapability): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(capability.downloadUrl);
  } catch {
    throw new CoreError('PLUGIN_DOWNLOAD_FAILED', `Failed to download plugin "${capability.id}"`);
  }
  if (!response.ok) {
    throw new CoreError(
      'PLUGIN_DOWNLOAD_FAILED',
      `Failed to download plugin "${capability.id}": ${response.status} ${response.statusText}`
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function parseHostRequest(
  input: string,
  pluginId: string
): { capabilityId: string; task: AgentTask } {
  const parsed = parseJson(
    input,
    'PLUGIN_HOST_REQUEST_INVALID',
    `Plugin "${pluginId}" supplied invalid host request JSON`
  );
  if (
    !isRecord(parsed) ||
    typeof parsed.capabilityId !== 'string' ||
    !isRecord(parsed.task) ||
    typeof parsed.task.type !== 'string' ||
    !isRecord(parsed.task.input)
  ) {
    throw new CoreError(
      'PLUGIN_HOST_REQUEST_INVALID',
      `Plugin "${pluginId}" supplied an invalid capability request`
    );
  }
  return {
    capabilityId: parsed.capabilityId,
    task: parsed.task as unknown as AgentTask,
  };
}

function parseJson(input: string, code: string, message: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new CoreError(code, message);
  }
}

function serializeJson(value: unknown, code: string, message: string): string {
  try {
    return serializeJsonValue(value);
  } catch {
    throw new CoreError(code, message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
