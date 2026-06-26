import { describe, it, expect, beforeAll } from 'vitest';
import { AgentStatus, type ClientAgentConfig } from '@agentforge/types';
import { ClientAgent } from '../ClientAgent.js';
import { ProviderFactory } from '../../provider/ProviderFactory.js';
import { MockProvider } from '../../provider/MockProvider.js';

beforeAll(() => {
  ProviderFactory.register('mock', MockProvider);
});

const clientConfig: ClientAgentConfig = {
  identity: { name: 'client', role: 'assistant', version: '0.0.1' },
  model: { provider: 'mock', modelName: 'mock-model' },
  systemPrompt: 'helpful',
  localCommandAuth: { level: 'readonly' },
};

describe('ClientAgent', () => {
  it('starts daemon and transitions to daemon-running', async () => {
    const agent = new ClientAgent(clientConfig);
    await agent.init();
    await agent.startDaemon();
    expect(agent.status).toBe(AgentStatus.DAEMON_RUNNING);
  });

  it('returns local command auth level', async () => {
    const agent = new ClientAgent(clientConfig);
    expect(agent.getLocalCommandAuthorization()).toBe('readonly');
  });

  it('defaults local command auth to disabled', () => {
    const agent = new ClientAgent({
      ...clientConfig,
      localCommandAuth: undefined,
    });
    expect(agent.getLocalCommandAuthorization()).toBe('disabled');
  });
});
