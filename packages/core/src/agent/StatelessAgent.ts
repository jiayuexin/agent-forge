import type { AgentTask, AgentResult, IStatelessAgent, StatelessAgentConfig } from '@agentforge/types';
import { BaseAgent } from './BaseAgent.js';
import { AgentExecutor } from '../runtime/AgentExecutor.js';
import { CoreError } from '../errors.js';

export class StatelessAgent extends BaseAgent<StatelessAgentConfig> implements IStatelessAgent {
  readonly isStateless = true as const;

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
