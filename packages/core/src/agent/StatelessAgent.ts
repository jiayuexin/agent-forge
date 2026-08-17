import type {
  AgentTask,
  AgentResult,
  IStatelessAgent,
  StatelessAgentConfig,
} from '@agentforge/types';
import { BaseAgent } from './BaseAgent.js';
import { CoreError } from '../errors.js';

export class StatelessAgent extends BaseAgent<StatelessAgentConfig> implements IStatelessAgent {
  readonly isStateless = true as const;

  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    if (!this.provider) {
      throw new CoreError('NOT_INITIALIZED', 'Provider not initialized');
    }
    return this.createExecutor().execute(task);
  }
}
