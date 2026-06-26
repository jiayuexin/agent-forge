import { eventHandler } from 'h3';
import type { IAgent } from '@agentforge/types';

export function createStatusRoute(agent: IAgent) {
  return eventHandler(() => {
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      version: agent.version,
      status: agent.status,
      capabilities: agent.capabilities,
    };
  });
}
