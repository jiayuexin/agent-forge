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
import {
  askLocalUserConfirmation,
  LocalCommandAuth,
  AuditLog,
} from '../security/index.js';

export class ClientAgent extends BaseAgent<ClientAgentConfig> implements IClientAgent {
  private readonly auditLog = new AuditLog();

  async startDaemon(): Promise<void> {
    this.lifecycle.transition(AgentStatus.DAEMON_RUNNING);
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

  async authorizeLocalCommand(command: string): Promise<void> {
    const auth = new LocalCommandAuth(this.config?.localCommandAuth ?? { level: 'disabled' });
    const result = auth.authorize(command);

    if (!result.allowed) {
      await this.auditLog.record({
        action: 'local-command',
        resource: command,
        outcome: 'denied',
        details: { reason: result.reason },
      });
      throw new CoreError('COMMAND_DENIED', result.reason ?? 'Command denied');
    }

    if (result.requiresConfirmation) {
      const confirmed = await askLocalUserConfirmation(
        { type: 'local-command', input: { command } },
        `Allow local command "${command}"? [y/N] `
      );
      if (!confirmed) {
        await this.auditLog.record({
          action: 'local-command',
          resource: command,
          outcome: 'denied',
          details: { reason: 'User rejected confirmation' },
        });
        throw new CoreError('USER_REJECTED', 'User rejected command execution');
      }
    }

    await this.auditLog.record({
      action: 'local-command',
      resource: command,
      outcome: 'success',
    });
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
