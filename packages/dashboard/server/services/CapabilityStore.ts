import type { Capability } from '@agentforge/types';
import { createHttpError } from '@agentforge/http-server';
import type { HubRepository } from '../storage/HubRepository.js';

export interface CapabilityStoreOptions {
  dataDir?: string;
  repository?: HubRepository;
}

interface StoredCapability {
  versions: Capability[];
}

export class CapabilityStore {
  private capabilities = new Map<string, StoredCapability>();
  private repository?: HubRepository;

  constructor(options: CapabilityStoreOptions = {}) {
    this.repository = options.repository;
  }

  async load(): Promise<void> {
    if (!this.repository) {
      return;
    }
    this.capabilities = new Map(
      this.repository.listCapabilities().map((record) => [record.id, { versions: record.versions }])
    );
  }

  async save(): Promise<void> {
    if (!this.repository) {
      return;
    }
    this.repository.replaceCapabilities(
      [...this.capabilities.entries()].map(([id, stored]) => ({ id, versions: stored.versions }))
    );
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
      throw createHttpError(
        'CAPABILITY_EXISTS',
        `Capability "${capability.id}" already exists`,
        409
      );
    }
    this.capabilities.set(capability.id, { versions: [capability] });
    await this.save();
  }

  async update(id: string, capability: Capability): Promise<void> {
    if (id !== capability.id) {
      throw createHttpError(
        'CAPABILITY_ID_MISMATCH',
        'Capability ID in path and body do not match',
        400
      );
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
    stored.versions.sort(compareSemverThenOrdinal);
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
    return [...stored.versions].sort(compareSemverThenOrdinal).at(-1);
  }
}

function compareSemverThenOrdinal(a: Capability, b: Capability): number {
  const av = parseSemver(a.version);
  const bv = parseSemver(b.version);
  if (av && bv) {
    return av[0] - bv[0] || av[1] - bv[1] || av[2] - bv[2];
  }
  return 0;
}

function parseSemver(version: string | undefined): [number, number, number] | undefined {
  if (!version) return undefined;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
