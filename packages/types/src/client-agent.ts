import type { IAgent } from './agent.js';
import type { AgentConfig } from './config.js';
import type { Capability } from './capability.js';
import type { AgentResult } from './result.js';
import type { AgentStreamChunk } from './core.js';
import type { AgentTask } from './task.js';

/**
 * ClientAgent runs locally on a user's machine and connects to a remote Capability Hub.
 */

export type LocalCommandAuthLevel = 'disabled' | 'readonly' | 'whitelist' | 'full';

export interface LocalCommandAuthConfig {
  level: LocalCommandAuthLevel;
  whitelist?: string[];
  requireConfirmationFor?: string[];
}

export interface ClientAgentConfig extends AgentConfig {
  hubUrl?: string;
  authToken?: string;
  capabilityCacheDir?: string;
  localCommandAuth?: LocalCommandAuthConfig;
}

export interface ClientAgentSecurityConfig {
  localCommandAuth?: LocalCommandAuthConfig;
  allowRemoteExecution?: boolean;
  requireLocalConfirmation?: string[];
}

export interface IClientAgent extends IAgent<ClientAgentConfig> {
  startDaemon(): Promise<void>;
  stopDaemon(): Promise<void>;
  connectToHub(hubUrl: string, token: string): Promise<void>;
  disconnectFromHub(): Promise<void>;
  getLocalCapabilityCache(): Capability[];
  getLocalCommandAuthorization(): LocalCommandAuthLevel;
}

export interface IClientAgentProxy {
  readonly nodeId: string;
  execute(task: AgentTask): Promise<AgentResult>;
  stream(task: AgentTask): AsyncIterable<AgentStreamChunk>;
}
