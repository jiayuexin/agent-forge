import type {
  AgentResult,
  AgentTask,
  Capability,
  CapabilityRegistry,
  CapabilityType,
} from '@agentforge/types';

export type CapabilityForType<TType extends CapabilityType> = Extract<Capability, { type: TType }>;

export interface CapabilityExecutionContext {
  readonly callStack: readonly string[];
  readonly maxDepth: number;
  readonly capabilities: CapabilityRegistry;
  executeCapability(capabilityId: string, task: AgentTask): Promise<AgentResult>;
  canExecuteCapability(capabilityId: string): boolean;
}

export interface CapabilityExecutor<TType extends CapabilityType = CapabilityType> {
  readonly type: TType;
  canExecute?(capability: CapabilityForType<TType>, context: CapabilityExecutionContext): boolean;
  execute(
    capability: CapabilityForType<TType>,
    task: AgentTask,
    context: CapabilityExecutionContext
  ): Promise<AgentResult>;
}
