import type { IAgent } from './agent.js';
import type { AgentConfig } from './config.js';
import type { Capability } from './capability.js';

/**
 * StatelessAgent runs in-process and is orchestrated by the SDK.
 */

export interface StatelessAgentConfig extends AgentConfig {
  availableCapabilities?: Capability[];
  allowPlanning?: boolean;
}

export interface IStatelessAgent extends IAgent<StatelessAgentConfig> {
  readonly isStateless: true;
}
