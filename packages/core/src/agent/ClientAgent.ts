import type {
  AgentTask,
  AgentResult,
  Capability,
  ClientCapabilitySource,
  ClientAgentConfig,
  IClientAgent,
  LocalCommandAuthLevel,
  ScopedAgentExecutionOptions,
  ToolDefinition,
} from '@agentforge/types';
import { AgentStatus } from '@agentforge/types';
import { BaseAgent } from './BaseAgent.js';
import { CoreError } from '../errors.js';
import { askLocalUserConfirmation, LocalCommandAuth, AuditLog } from '../security/index.js';

export class ClientAgent extends BaseAgent<ClientAgentConfig> implements IClientAgent {
  private readonly auditLog = new AuditLog();
  private capabilitySource?: ClientCapabilitySource;

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
    return [...(this.capabilitySource?.listCapabilities() ?? [])];
  }

  setCapabilitySource(source: ClientCapabilitySource): void {
    this.capabilitySource = source;
  }

  async executeLocalCapability(capabilityId: string, task: AgentTask): Promise<AgentResult> {
    if (!this.capabilitySource) {
      throw new CoreError(
        'CAPABILITY_SOURCE_NOT_CONFIGURED',
        'No local capability source is configured'
      );
    }
    return this.capabilitySource.executeCapability(capabilityId, task);
  }

  async executeScopedTask(
    task: AgentTask,
    options: ScopedAgentExecutionOptions
  ): Promise<AgentResult> {
    return this.createExecutor({
      systemPrompt: options.systemPrompt,
      tools: options.tools,
    }).execute(task);
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
    return this.createExecutor().execute(task);
  }

  protected override getAvailableTools(): readonly ToolDefinition[] {
    return [...super.getAvailableTools(), ...(this.capabilitySource?.listTools() ?? [])];
  }
}
