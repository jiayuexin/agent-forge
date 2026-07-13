import type { AgentCapability, CapabilityType, JSONSchema } from './core.js';

/**
 * Capability registry and capability definition types.
 */

interface CapabilityDefinition extends AgentCapability {
  id: string;
  tags?: string[];
  version?: string;
  dependencies?: string[];
}

export interface AgentCapabilityDefinition extends CapabilityDefinition {
  type: 'agent';
}

export type AgentCapabilityRegistration = Partial<Omit<AgentCapabilityDefinition, 'type'>> & {
  type?: 'agent';
};

export interface RemoteAgentCapability extends CapabilityDefinition {
  type: 'remote-agent';
  nodeId: string;
  endpoint?: string;
}

export interface ToolCapability extends CapabilityDefinition {
  type: 'tool';
  endpointType: 'local-command' | 'local-function' | 'http' | 'remote-agent';
  endpoint: {
    target: string;
    method?: 'exec' | 'call' | 'post' | 'get';
  };
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
}

export interface SkillCapability extends CapabilityDefinition {
  type: 'skill';
  tools: string[];
  promptTemplate: string;
  examples?: Array<{ input: unknown; output: unknown }>;
}

export interface SandboxConfig {
  timeoutMs: number;
  maxMemoryPages: number;
}

export interface PluginCapability extends CapabilityDefinition {
  type: 'plugin';
  downloadUrl: string;
  signature: string;
  keyId: string;
  entry: string;
  allowedCapabilities: string[];
  sandbox: SandboxConfig;
}

export type Capability =
  | AgentCapabilityDefinition
  | RemoteAgentCapability
  | ToolCapability
  | SkillCapability
  | PluginCapability;

export interface CapabilityRegistryOptions {
  onConflict?: 'overwrite' | 'ignore' | 'throw';
}

export interface CapabilityRegistry {
  register(capability: Capability, options?: CapabilityRegistryOptions): void;
  unregister(id: string): void;
  list(filters?: { type?: CapabilityType | CapabilityType[]; tags?: string[] }): Capability[];
  get(id: string): Capability | undefined;
  toPrompt(): string;
}
