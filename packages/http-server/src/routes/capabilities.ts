import { eventHandler } from 'h3';
import type { IAgent } from '@agentforge/types';

export function createCapabilitiesRoute(agent: IAgent) {
  return eventHandler(() => {
    return agent.capabilities;
  });
}
