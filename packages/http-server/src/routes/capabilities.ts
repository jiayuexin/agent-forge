import { eventHandler } from 'h3';
import type { Capability, IAgent } from '@agentforge/types';

export function createCapabilitiesRoute(agent: IAgent) {
  return eventHandler(() => {
    return [
      ...agent.capabilities,
      ...(hasLocalCapabilityCache(agent) ? agent.getLocalCapabilityCache() : []),
    ];
  });
}

function hasLocalCapabilityCache(
  agent: IAgent
): agent is IAgent & { getLocalCapabilityCache(): Capability[] } {
  return 'getLocalCapabilityCache' in agent && typeof agent.getLocalCapabilityCache === 'function';
}
