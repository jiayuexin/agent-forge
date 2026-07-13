import type { AgentCapabilityDefinition, AgentResult, AgentTask, IAgent } from '@agentforge/types';
import { SDKError } from '../errors.js';
import type { CapabilityExecutor } from './types.js';

export type AgentCapabilityResolver = (capabilityId: string) => IAgent | undefined;

export class AgentCapabilityExecutor implements CapabilityExecutor<'agent'> {
  readonly type = 'agent' as const;

  constructor(private readonly resolveAgent: AgentCapabilityResolver) {}

  canExecute(capability: AgentCapabilityDefinition): boolean {
    return this.resolveAgent(capability.id) !== undefined;
  }

  async execute(capability: AgentCapabilityDefinition, task: AgentTask): Promise<AgentResult> {
    const agent = this.resolveAgent(capability.id);
    if (!agent) {
      throw new SDKError(
        'CAPABILITY_AGENT_NOT_FOUND',
        `No agent provides capability "${capability.id}"`
      );
    }
    return agent.execute(task);
  }
}
