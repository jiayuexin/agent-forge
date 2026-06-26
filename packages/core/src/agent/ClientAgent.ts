import type {
  AgentTask,
  AgentResult,
  Capability,
  ClientAgentConfig,
  IClientAgent,
  LocalCommandAuthLevel,
} from '@agentforge/types';
import { AgentStatus } from '@agentforge/types';
import { BaseAgent } from './BaseAgent.js';
import { AgentExecutor } from '../runtime/AgentExecutor.js';
import { CoreError } from '../errors.js';

export class ClientAgent extends BaseAgent<ClientAgentConfig> implements IClientAgent {
  async startDaemon(): Promise<void> {
    this.lifecycle.transition(AgentStatus.DAEMON_RUNNING);
    // Hub/daemon runtime is implemented in @agentforge/runtime-client.
  }

  async stopDaemon(): Promise<void> {
    // Hub/daemon runtime is implemented in @agentforge/runtime-client.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async connectToHub(_hubUrl: string, _token: string): Promise<void> {
    // Hub connection is implemented in @agentforge/runtime-client.
  }

  async disconnectFromHub(): Promise<void> {
    // Hub connection is implemented in @agentforge/runtime-client.
  }

  getLocalCapabilityCache(): Capability[] {
    return [];
  }

  getLocalCommandAuthorization(): LocalCommandAuthLevel {
    return this.config?.localCommandAuth?.level ?? 'disabled';
  }

  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    if (!this.provider) {
      throw new CoreError('NOT_INITIALIZED', 'Provider not initialized');
    }
    const executor = new AgentExecutor(
      this.provider,
      this.config?.tools ?? [],
      this.config?.systemPrompt ?? ''
    );
    return executor.execute(task);
  }
}
