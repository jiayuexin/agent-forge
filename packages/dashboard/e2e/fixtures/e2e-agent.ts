import { ClientAgent, MockProvider, ProviderFactory } from '@agentforge/core';
import type { ClientAgentConfig, IClientAgent } from '@agentforge/types';

export const E2E_NODE_NAME = 'E2E ClientAgent';

export function createE2EClientAgent(overrides?: { id?: string; name?: string }): IClientAgent {
  if (!ProviderFactory.list().includes('mock')) {
    ProviderFactory.register('mock', MockProvider);
  }

  const config: ClientAgentConfig = {
    identity: {
      id: overrides?.id,
      name: overrides?.name ?? E2E_NODE_NAME,
      role: 'assistant',
      version: '1.0.0',
    },
    model: { provider: 'mock', modelName: 'mock-model' },
    systemPrompt: 'You are a local ClientAgent used in end-to-end tests.',
  };

  return new ClientAgent(config);
}
