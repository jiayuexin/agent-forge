import type { Capability } from './capability.js';
import type { CapabilityType } from './core.js';
import type { AgentResult } from './result.js';
import type { AgentTask } from './task.js';
import type { IAgent } from './agent.js';

/**
 * Model-driven planning and execution types.
 */

export interface ExecutionPlan {
  goal: string;
  capabilitiesUsed: string[];
  steps: PlanStep[];
  constraints?: PlanConstraints;
}

export interface PlanStep {
  id: string;
  name: string;
  capability: string;
  type: CapabilityType;
  task: string;
  input: Record<string, unknown>;
  dependsOn?: string[];
  outputAs?: string;
  fallback?: string;
}

export interface PlanConstraints {
  maxSteps?: number;
  requireApproval?: boolean;
  timeout?: number;
}

export interface PlanResult {
  success: boolean;
  output: AgentResult['output'];
  plan: ExecutionPlan;
  stepResults: StepResult[];
  totalDuration: number;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output: unknown;
  duration: number;
  error?: import('./core.js').AgentError;
}

export interface PlannerConfig {
  availableCapabilities?: Capability[];
  allowPlanning?: boolean;
  temperature?: number;
  maxTokens?: number;
  maxReplanAttempts?: number;
}

export interface IPlannerAgent {
  plan(task: AgentTask, options?: PlanOptions): Promise<ExecutionPlan>;
  replan(failedStep: StepResult, context: PlanContext): Promise<ExecutionPlan>;
}

export interface PlanOptions {
  constraints?: PlanConstraints;
  requireApproval?: boolean;
  previousPlan?: ExecutionPlan;
}

export interface PlanContext {
  task: AgentTask;
  plan: ExecutionPlan;
  failedStep: StepResult;
  completedSteps: StepResult[];
  remainingSteps: PlanStep[];
  userInput: Record<string, unknown>;
  attemptNumber: number;
}

export interface ReplanHistory {
  failedStepId: string;
  errorCode: string;
  attemptNumber: number;
  timestamp: number;
}

export interface IPlanExecutor {
  execute(plan: ExecutionPlan, options?: PlanExecutionOptions): Promise<PlanResult>;
}

export interface PlanExecutionOptions {
  stepTimeout?: number;
  planTimeout?: number;
  maxReplanAttempts?: number;
  approvalHandler?: ApprovalHandler;
}

export interface ApprovalResult {
  approved: boolean;
  modifiedPlan?: ExecutionPlan;
  reason?: string;
}

export interface ApprovalHandler {
  (plan: ExecutionPlan): Promise<ApprovalResult>;
}

export interface OrchestrateOptions {
  requireApproval?: boolean;
  maxReplanAttempts?: number;
  constraints?: PlanConstraints;
  fixedWorkflow?: boolean;
}

export interface AgentConstructor<TConfig extends import('./config.js').AgentConfig = import('./config.js').AgentConfig> {
  new (...args: unknown[]): IAgent<TConfig>;
  capability?: Partial<Capability>;
}

export interface AgentRegistry {
  register(name: string, agent: AgentConstructor): void;
  unregister(name: string): void;
  get(name: string): AgentConstructor | undefined;
  list(): Array<{ name: string; agent: AgentConstructor }>;
}
