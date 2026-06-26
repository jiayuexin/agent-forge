import type { AgentResult } from './result.js';
import type { ModelRef } from './model.js';

/**
 * Deterministic pipeline execution types.
 */

export interface PipelineControlSignal {
  action: 'continue' | 'back' | 'jump' | 'pause' | 'stop' | 'fork' | 'replace';
  targetStep?: string;
  message?: string;
  context?: Record<string, unknown>;
  maxRetries?: number;
  reason?: string;
}

export interface StepSnapshot {
  stepName: string;
  stepIndex: number;
  timestamp: number;
  input: unknown;
  output: AgentResult;
  duration: number;
  control?: PipelineControlSignal;
  agentState?: unknown;
}

export interface BacktrackEvent {
  fromStep: string;
  toStep: string;
  reason: string;
  retryCount: number;
  maxRetries: number;
  timestamp: number;
  control: PipelineControlSignal;
}

export interface ISnapshotable {
  snapshot(): Promise<unknown>;
  restore(state: unknown): Promise<void>;
}

export interface PipelineResult {
  finalOutput: AgentResult;
  success: boolean;
  steps: StepSnapshot[];
  backtrackHistory: BacktrackEvent[];
  totalDuration: number;
}

export interface PipelineConfig {
  defaultModel?: string;
  maxBacktracks?: number;
  defaultMaxRetry?: number;
  snapshotEnabled?: boolean;
  backtrackLogging?: 'silent' | 'summary' | 'verbose';
  onBacktrack?: (event: BacktrackEvent) => void;
}

export interface StepOptions {
  agent: string;
  task: string;
  input?: Record<string, unknown>;
  timeout?: number;
  model?: string | ModelRef;
  transform?: (prevOutput: AgentResult) => unknown;
  intercept?: (
    output: AgentResult,
    context: Record<string, unknown>
  ) => PipelineControlSignal;
}

export interface ParallelStep {
  name?: string;
  agent: string;
  task: string;
  input?: Record<string, unknown>;
  model?: string | ModelRef;
}

export interface InterceptorHandler {
  stepName: string;
  handler: (
    output: AgentResult,
    context: Record<string, unknown>
  ) => PipelineControlSignal | void;
}

export interface ForkBranch {
  name: string;
  agent: string;
  task: string;
  input?: Record<string, unknown>;
  model?: string | ModelRef;
}
