import type { AgentCapability, CapabilityType } from './core.js';

/**
 * Capability registry and capability definition types.
 */

export interface Capability extends AgentCapability {
  id: string;
  type: CapabilityType;
  tags?: string[];
  version?: string;
  dependencies?: string[];
}

export interface RemoteAgentCapability extends Capability {
  type: 'remote-agent';
  nodeId: string;
  endpoint?: string;
}

export interface CapabilityRegistryOptions {
  onConflict?: 'overwrite' | 'ignore' | 'throw';
}

export interface CapabilityRegistry {
  register(capability: Capability, options?: CapabilityRegistryOptions): void;
  unregister(id: string): void;
  list(filters?: {
    type?: CapabilityType | CapabilityType[];
    tags?: string[];
  }): Capability[];
  get(id: string): Capability | undefined;
  toPrompt(): string;
}
