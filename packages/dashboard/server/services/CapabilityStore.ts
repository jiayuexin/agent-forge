import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Capability } from '@agentforge/types';
import { createHttpError } from '@agentforge/http-server';

export interface CapabilityStoreOptions {
  dataDir?: string;
}

interface StoredCapability {
  versions: Capability[];
}

export class CapabilityStore {
  private capabilities = new Map<string, StoredCapability>();
  private dataDir: string;

  constructor(options: CapabilityStoreOptions = {}) {
    this.dataDir = options.dataDir ?? '.agentforge/hub';
  }

  async load(): Promise<void> {
    try {
      const path = this.filePath();
      const text = await readFile(path, 'utf-8');
      const data = JSON.parse(text) as Record<string, StoredCapability>;
      this.capabilities = new Map(Object.entries(data));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async save(): Promise<void> {
    const path = this.filePath();
    await mkdir(dirname(path), { recursive: true });
    const data = Object.fromEntries(this.capabilities);
    await writeFile(path, JSON.stringify(data, null, 2));
  }

  list(): Capability[] {
    const result: Capability[] = [];
    for (const stored of this.capabilities.values()) {
      const latest = this.latest(stored);
      if (latest) result.push(latest);
    }
    return result;
  }

  get(id: string): Capability | undefined {
    const stored = this.capabilities.get(id);
    if (!stored) return undefined;
    return this.latest(stored);
  }

  getVersion(id: string, version: string): Capability | undefined {
    const stored = this.capabilities.get(id);
    return stored?.versions.find((c) => c.version === version);
  }

  versions(id: string): Capability[] {
    const stored = this.capabilities.get(id);
    return stored?.versions.slice() ?? [];
  }

  async create(capability: Capability): Promise<void> {
    if (this.capabilities.has(capability.id)) {
      throw createHttpError('CAPABILITY_EXISTS', `Capability "${capability.id}" already exists`, 409);
    }
    this.capabilities.set(capability.id, { versions: [capability] });
    await this.save();
  }

  async update(id: string, capability: Capability): Promise<void> {
    if (id !== capability.id) {
      throw createHttpError('CAPABILITY_ID_MISMATCH', 'Capability ID in path and body do not match', 400);
    }
    const stored = this.capabilities.get(id);
    if (!stored) {
      throw createHttpError('CAPABILITY_NOT_FOUND', `Capability "${id}" not found`, 404);
    }
    const index = stored.versions.findIndex((c) => c.version === capability.version);
    if (index >= 0) {
      stored.versions[index] = capability;
    } else {
      stored.versions.push(capability);
    }
    await this.save();
  }

  async delete(id: string): Promise<void> {
    const existed = this.capabilities.delete(id);
    if (!existed) {
      throw createHttpError('CAPABILITY_NOT_FOUND', `Capability "${id}" not found`, 404);
    }
    await this.save();
  }

  private latest(stored: StoredCapability): Capability | undefined {
    if (stored.versions.length === 0) return undefined;
    return stored.versions[stored.versions.length - 1];
  }

  private filePath(): string {
    return join(this.dataDir, 'capabilities.json');
  }
}
