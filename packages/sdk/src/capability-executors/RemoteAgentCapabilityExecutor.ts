import type { AgentResult, AgentTask, RemoteAgentCapability } from '@agentforge/types';
import { ClientAgentProxy, type RemoteAgentInvoker } from '../ClientAgentProxy.js';
import { RemoteAgentNotConnectedError } from '../errors.js';
import type { CapabilityExecutor } from './types.js';

export type RemoteAgentInvokerProvider = () => RemoteAgentInvoker | undefined;

export class RemoteAgentCapabilityExecutor implements CapabilityExecutor<'remote-agent'> {
  readonly type = 'remote-agent' as const;

  constructor(private readonly getInvoker: RemoteAgentInvokerProvider) {}

  canExecute(): boolean {
    return this.getInvoker() !== undefined;
  }

  async execute(capability: RemoteAgentCapability, task: AgentTask): Promise<AgentResult> {
    const invoker = this.getInvoker();
    if (!invoker) {
      throw new RemoteAgentNotConnectedError();
    }
    return new ClientAgentProxy(capability.nodeId, invoker).execute(task);
  }
}
