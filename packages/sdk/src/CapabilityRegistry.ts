import type {
  Capability,
  CapabilityRegistry as ICapabilityRegistry,
  CapabilityRegistryOptions,
  CapabilityType,
} from '@agentforge/types';
import { CapabilityConflictError } from './errors.js';

export class CapabilityRegistry implements ICapabilityRegistry {
  private capabilities = new Map<string, Capability>();
  private defaultConflict?: CapabilityRegistryOptions['onConflict'];

  constructor(defaultConflict?: CapabilityRegistryOptions['onConflict']) {
    this.defaultConflict = defaultConflict;
  }

  register(capability: Capability, options?: CapabilityRegistryOptions): void {
    const existing = this.capabilities.get(capability.id);
    if (existing) {
      const strategy = options?.onConflict ?? this.defaultConflict;
      if (strategy === undefined) {
        // Default behavior: keep the higher version.
        if (this.compareVersion(existing.version, capability.version) >= 0) {
          return;
        }
      } else {
        switch (strategy) {
          case 'throw':
            throw new CapabilityConflictError(capability.id);
          case 'ignore':
            return;
          case 'overwrite':
            break;
        }
      }
    }
    this.capabilities.set(capability.id, capability);
  }

  unregister(id: string): void {
    this.capabilities.delete(id);
  }

  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  list(filters?: { type?: CapabilityType | CapabilityType[]; tags?: string[] }): Capability[] {
    const types = filters?.type ? (Array.isArray(filters.type) ? filters.type : [filters.type]) : undefined;
    const tags = filters?.tags;
    return Array.from(this.capabilities.values()).filter((cap) => {
      if (types && !types.includes(cap.type)) return false;
      if (tags && !cap.tags?.some((t) => tags.includes(t))) return false;
      return true;
    });
  }

  toPrompt(): string {
    const caps = Array.from(this.capabilities.values());
    if (caps.length === 0) return 'No capabilities registered.';

    return caps
      .map((cap) => {
        const lines = [
          `## ${cap.id}`,
          `- type: ${cap.type}`,
          `- name: ${cap.name}`,
          `- description: ${cap.description}`,
        ];
        if (cap.version) lines.push(`- version: ${cap.version}`);
        if (cap.riskLevel) lines.push(`- riskLevel: ${cap.riskLevel}`);
        if (cap.tags?.length) lines.push(`- tags: ${cap.tags.join(', ')}`);
        if (cap.inputSchema) lines.push(`- inputSchema: ${JSON.stringify(cap.inputSchema)}`);
        if (cap.outputSchema) lines.push(`- outputSchema: ${JSON.stringify(cap.outputSchema)}`);
        if (cap.sensitiveOperations?.length) {
          lines.push(`- sensitiveOperations: ${cap.sensitiveOperations.join(', ')}`);
        }
        return lines.join('\n');
      })
      .join('\n\n');
  }

  private compareVersion(left?: string, right?: string): number {
    if (left === right) return 0;
    if (!left) return -1;
    if (!right) return 1;

    const leftParts = left.split('.').map((p) => Number.parseInt(p, 10));
    const rightParts = right.split('.').map((p) => Number.parseInt(p, 10));
    const max = Math.max(leftParts.length, rightParts.length);

    for (let i = 0; i < max; i++) {
      const l = Number.isFinite(leftParts[i]) ? leftParts[i] : 0;
      const r = Number.isFinite(rightParts[i]) ? rightParts[i] : 0;
      if (l > r) return 1;
      if (l < r) return -1;
    }
    return 0;
  }
}
