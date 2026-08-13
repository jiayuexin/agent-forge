import type {
  AgentResult,
  AgentStreamChunk,
  AgentTask,
  IClientAgentProxy,
  RemoteAgentInvoker,
} from '@agentforge/types';

export type { RemoteAgentInvoker } from '@agentforge/types';

export class ClientAgentProxy implements IClientAgentProxy {
  readonly nodeId: string;
  private invoker: RemoteAgentInvoker;

  constructor(nodeId: string, invoker: RemoteAgentInvoker) {
    this.nodeId = nodeId;
    this.invoker = invoker;
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    return this.invoker.execute(this.nodeId, task);
  }

  async *stream(task: AgentTask): AsyncIterable<AgentStreamChunk> {
    if (this.invoker.stream) {
      yield* this.invoker.stream(this.nodeId, task);
      return;
    }

    const result = await this.execute(task);
    yield { type: 'text', content: result.output.content, index: 0 };
    yield { type: 'done', index: 1 };
  }
}
