import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Capability,
  CapabilityAckPayload,
  CapabilityDistributePayload,
  Logger,
  PluginCapability,
} from '@agentforge/types';
import { CoreError, verifyPluginArtifact } from '@agentforge/core';

export interface CapabilityCacheOptions {
  cacheDir?: string;
  logger?: Logger;
  trustStoreDir?: string;
}

export interface CapabilityInstallOptions {
  backup?: boolean;
}

interface CacheManifest {
  version: '1';
  capabilities: Record<string, { version?: string; installedAt: number }>;
}

interface PreparedPluginArtifacts {
  wasmBytes: Buffer;
  signature: string;
}

export class CapabilityCache {
  readonly cacheDir: string;
  readonly trustStoreDir: string;
  private readonly logger: Logger;
  private readonly capabilities = new Map<string, Capability>();
  private manifest: CacheManifest = { version: '1', capabilities: {} };

  constructor(options?: CapabilityCacheOptions) {
    this.cacheDir = options?.cacheDir ?? '.agentforge/capabilities';
    this.trustStoreDir = options?.trustStoreDir ?? '.agentforge/trust-keys';
    this.logger = options?.logger ?? consoleLogger();
  }

  async load(): Promise<Capability[]> {
    await this.ensureDir();

    try {
      await this.readManifest();
    } catch {
      this.manifest = { version: '1', capabilities: {} };
    }

    this.capabilities.clear();

    for (const id of Object.keys(this.manifest.capabilities)) {
      try {
        assertCapabilityId(id);
        const definition = await this.readDefinition(id);
        if (definition.id !== id) {
          throw new CoreError(
            'CAPABILITY_ID_MISMATCH',
            `Cached capability "${id}" contains definition id "${definition.id}"`
          );
        }
        if (definition.type === 'plugin') {
          await verifyPluginArtifact(definition, await this.readPluginArtifact(id), {
            trustStoreDir: this.trustStoreDir,
          });
        }
        this.capabilities.set(id, definition);
      } catch (error) {
        this.logger.error(`Failed to load capability ${id} from cache`, error);
      }
    }

    return this.list();
  }

  list(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  async readPluginArtifact(capabilityId: string): Promise<Uint8Array> {
    assertCapabilityId(capabilityId);
    return readFile(join(this.capabilityDir(capabilityId), 'plugin.wasm'));
  }

  async install(
    payload: CapabilityDistributePayload,
    options?: CapabilityInstallOptions
  ): Promise<CapabilityAckPayload> {
    return this.addOrUpdate(payload, options);
  }

  async update(
    payload: CapabilityDistributePayload,
    options?: CapabilityInstallOptions
  ): Promise<CapabilityAckPayload> {
    return this.addOrUpdate(payload, options);
  }

  async remove(capabilityId: string): Promise<CapabilityAckPayload> {
    try {
      assertCapabilityId(capabilityId);
      await this.ensureDir();
      const dir = this.capabilityDir(capabilityId);
      await rm(dir, { recursive: true, force: true });
      delete this.manifest.capabilities[capabilityId];
      this.capabilities.delete(capabilityId);
      await this.writeManifest();

      return {
        messageId: '',
        capabilityId,
        status: 'installed',
      };
    } catch (error) {
      return this.failedAck(capabilityId, error);
    }
  }

  private async addOrUpdate(
    payload: CapabilityDistributePayload,
    options?: CapabilityInstallOptions
  ): Promise<CapabilityAckPayload> {
    const { capability } = payload;
    const capabilityId = capability.id;

    try {
      assertCapabilityId(capabilityId);
      await this.ensureDir();

      const pluginArtifacts =
        capability.type === 'plugin' ? await this.preparePluginArtifacts(capability) : undefined;

      if (options?.backup && this.manifest.capabilities[capabilityId]) {
        await this.backup(capabilityId);
      }

      const dir = this.capabilityDir(capabilityId);
      await mkdir(dir, { recursive: true });
      await this.writeDefinition(capability);

      if (pluginArtifacts) {
        await this.writePluginArtifacts(pluginArtifacts, dir);
      }

      this.manifest.capabilities[capabilityId] = {
        version: capability.version,
        installedAt: Date.now(),
      };
      this.capabilities.set(capabilityId, capability);
      await this.writeManifest();

      return {
        messageId: '',
        capabilityId,
        status: 'installed',
        installedVersion: capability.version,
      };
    } catch (error) {
      return this.failedAck(capabilityId, error);
    }
  }

  private async preparePluginArtifacts(
    capability: PluginCapability
  ): Promise<PreparedPluginArtifacts> {
    const response = await fetch(capability.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download plugin: ${response.status} ${response.statusText}`);
    }
    const wasmBytes = Buffer.from(await response.arrayBuffer());
    await verifyPluginArtifact(capability, wasmBytes, {
      trustStoreDir: this.trustStoreDir,
    });

    return {
      wasmBytes,
      signature: capability.signature,
    };
  }

  private async writePluginArtifacts(
    artifacts: PreparedPluginArtifacts,
    dir: string
  ): Promise<void> {
    await writeFile(join(dir, 'plugin.wasm'), artifacts.wasmBytes);
    await writeFile(join(dir, 'signature.txt'), artifacts.signature);
  }

  private async backup(capabilityId: string): Promise<void> {
    const existing = this.manifest.capabilities[capabilityId];
    if (!existing) {
      return;
    }

    const dir = this.capabilityDir(capabilityId);
    const backupName = `${capabilityId}-${existing.version ?? 'unknown'}-${Date.now()}`;
    const backupDir = join(this.cacheDir, backupName);

    try {
      const entries = await readdir(dir).catch(() => [] as string[]);
      if (entries.length > 0) {
        await mkdir(backupDir, { recursive: true });
        for (const entry of entries) {
          const content = await readFile(join(dir, entry));
          await writeFile(join(backupDir, entry), content);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to backup capability ${capabilityId}`, error);
    }
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  private manifestPath(): string {
    return join(this.cacheDir, 'manifest.json');
  }

  private capabilityDir(id: string): string {
    assertCapabilityId(id);
    return join(this.cacheDir, id);
  }

  private definitionPath(id: string): string {
    return join(this.capabilityDir(id), 'definition.json');
  }

  private async readManifest(): Promise<void> {
    const content = await readFile(this.manifestPath(), 'utf-8');
    this.manifest = JSON.parse(content) as CacheManifest;
  }

  private async writeManifest(): Promise<void> {
    await writeFile(this.manifestPath(), JSON.stringify(this.manifest, null, 2));
  }

  private async readDefinition(id: string): Promise<Capability> {
    const content = await readFile(this.definitionPath(id), 'utf-8');
    return JSON.parse(content) as Capability;
  }

  private async writeDefinition(capability: Capability): Promise<void> {
    await writeFile(this.definitionPath(capability.id), JSON.stringify(capability, null, 2));
  }

  private failedAck(capabilityId: string, error: unknown): CapabilityAckPayload {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Capability operation failed for ${capabilityId}`, error);
    return {
      messageId: '',
      capabilityId,
      status: 'failed',
      error: message,
    };
  }
}

function assertCapabilityId(capabilityId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(capabilityId)) {
    throw new CoreError(
      'INVALID_CAPABILITY_ID',
      `Capability id "${capabilityId}" is not a valid cache identifier`
    );
  }
}

function consoleLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => consoleLogger(),
  };
}
