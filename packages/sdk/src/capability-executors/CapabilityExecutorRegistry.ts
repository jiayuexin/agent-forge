import type { AgentResult, AgentTask, Capability, CapabilityType } from '@agentforge/types';
import { SDKError } from '../errors.js';
import type { CapabilityExecutionContext, CapabilityExecutor } from './types.js';

export class CapabilityExecutorRegistry {
  private readonly executors = new Map<CapabilityType, CapabilityExecutor>();

  register(executor: CapabilityExecutor): void {
    if (this.executors.has(executor.type)) {
      throw new SDKError(
        'DUPLICATE_CAPABILITY_EXECUTOR',
        `An executor for capability type "${executor.type}" is already registered`
      );
    }
    this.executors.set(executor.type, executor);
  }

  canExecute(capability: Capability, context: CapabilityExecutionContext): boolean {
    const executor = this.executors.get(capability.type);
    if (!executor) return false;
    return executor.canExecute?.(capability, context) ?? true;
  }

  async execute(
    capability: Capability,
    task: AgentTask,
    context: CapabilityExecutionContext
  ): Promise<AgentResult> {
    const executor = this.executors.get(capability.type);
    if (!executor) {
      throw new SDKError(
        'CAPABILITY_EXECUTOR_NOT_FOUND',
        `No executor is registered for capability type "${capability.type}"`
      );
    }
    return executor.execute(capability, task, context);
  }
}
