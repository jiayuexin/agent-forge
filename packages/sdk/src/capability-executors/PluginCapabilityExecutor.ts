import type { AgentResult, AgentTask, PluginCapability } from '@agentforge/types';
import { SDKError } from '../errors.js';
import type { CapabilityExecutionContext, CapabilityExecutor } from './types.js';

export interface PluginCapabilityInvoker {
  execute(
    capability: PluginCapability,
    task: AgentTask,
    context: CapabilityExecutionContext
  ): Promise<AgentResult>;
}

export type PluginCapabilityInvokerProvider = () => PluginCapabilityInvoker | undefined;

export class PluginCapabilityExecutor implements CapabilityExecutor<'plugin'> {
  readonly type = 'plugin' as const;

  constructor(private readonly getInvoker: PluginCapabilityInvokerProvider) {}

  canExecute(): boolean {
    return this.getInvoker() !== undefined;
  }

  async execute(
    capability: PluginCapability,
    task: AgentTask,
    context: CapabilityExecutionContext
  ): Promise<AgentResult> {
    const invoker = this.getInvoker();
    if (!invoker) {
      throw new SDKError(
        'PLUGIN_RUNTIME_NOT_CONFIGURED',
        `No plugin runtime is configured for capability "${capability.id}"`
      );
    }
    return invoker.execute(capability, task, context);
  }
}
