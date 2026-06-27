import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Capability,
  CapabilityAckPayload,
  CapabilityDistributePayload,
  Logger,
} from '@agentforge/types';
import { verifyPluginSignature } from '@agentforge/core';

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

export class CapabilityCache {
  readonly cacheDir: string;
  private readonly logger: Logger;
  private readonly trustStoreDir: string;
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
        const definition = await this.readDefinition(id);
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
      await this.ensureDir();

      if (options?.backup && this.manifest.capabilities[capabilityId]) {
        await this.backup(capabilityId);
      }

      const dir = this.capabilityDir(capabilityId);
      await mkdir(dir, { recursive: true });
      await this.writeDefinition(capability);

      if (payload.capability.type === 'plugin') {
        await this.handlePluginPayload(payload, dir);
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

  private async handlePluginPayload(
    payload: CapabilityDistributePayload,
    dir: string
  ): Promise<void> {
    if (payload.downloadUrl) {
      const response = await fetch(payload.downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download plugin: ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(join(dir, 'package.tgz'), buffer);
    }

    if (payload.signature) {
      const payloadBuffer = payload.downloadUrl
        ? await readFile(join(dir, 'package.tgz'))
        : Buffer.from(JSON.stringify(payload.capability));
      const valid = await verifyPluginSignature({
        payload: payloadBuffer,
        signature: payload.signature,
        trustStoreDir: this.trustStoreDir,
      });
      if (!valid) {
        throw new Error('Plugin signature verification failed');
      }
      await writeFile(join(dir, 'signature.pem'), payload.signature);
    }
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

function consoleLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => consoleLogger(),
  };
}
