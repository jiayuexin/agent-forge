import { AgentRuntimeClient } from '@agentforge/runtime-client';
import type { ClientAgent } from '@agentforge/core';

let runtimeClient: AgentRuntimeClient | undefined;

export async function connectToHub(agent: ClientAgent, hubUrl: string, token: string): Promise<void> {
  runtimeClient = new AgentRuntimeClient(agent, {
    hubUrl,
    authToken: token,
    nodeName: agent.name,
    allowRemoteExecution: true,
    capabilityCacheDir: '.agentforge/capabilities',
  });
  await runtimeClient.start();
}
