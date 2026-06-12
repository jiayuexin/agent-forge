/** @see docs/01-核心设计.md §1.8, §1.11 */

import type { AgentResult } from './result';
import type { ModelRef } from './provider';

/** Pipeline 控制信号 — Agent 或拦截器可通过此信号控制流水线流向 */
export interface PipelineControlSignal {
  action:
    | 'continue' // 正常继续下一步
    | 'back' // 回退到指定步骤重做
    | 'jump' // 跳转到指定步骤（前进或后退）
    | 'pause' // 暂停流水线，等待外部输入
    | 'stop' // 终止流水线
    | 'fork' // 从当前步骤分叉出并行分支
    | 'replace'; // 用另一个 Agent 替换当前步骤的后续步骤

  targetStep?: string; // back/jump/replace 的目标步骤名
  message?: string; // 传给目标步骤的反馈信息
  context?: Record<string, unknown>; // 附带的上下文数据
  maxRetries?: number; // back 模式的最大重试次数（默认 1）
  reason?: string; // 回退/跳转的原因（用于日志和审计）
}

/** 步骤快照 — 每步执行完毕后自动保存 */
export interface StepSnapshot {
  stepName: string;
  stepIndex: number;
  timestamp: number;
  input: unknown;
  output: AgentResult;
  duration: number;
  control?: PipelineControlSignal;
  agentState?: unknown; // Agent 内部状态快照（需实现 ISnapshotable）
}

/** 回退事件记录 */
export interface BacktrackEvent {
  fromStep: string;
  toStep: string;
  reason: string;
  retryCount: number;
  maxRetries: number;
  timestamp: number;
  control: PipelineControlSignal;
}

/** Pipeline 执行结果 */
export interface PipelineResult {
  finalOutput: AgentResult;
  success: boolean;
  steps: StepSnapshot[];
  backtrackHistory: BacktrackEvent[];
  totalDuration: number;
}

/** Pipeline 全局配置 */
export interface PipelineConfig {
  defaultModel?: string; // Pipeline 级默认模型名（引用 modelRegistry 中的模型）
  maxBacktracks?: number; // 全局最大回退次数（默认 5），防止无限循环
  defaultMaxRetry?: number; // 每步默认最大重试次数（默认 2）
  snapshotEnabled?: boolean; // 是否保存快照（默认 true）
  backtrackLogging?: 'silent' | 'summary' | 'verbose'; // 回退日志级别
  onBacktrack?: (event: BacktrackEvent) => void; // 回退回调
}

/** Agent 快照接口 — Agent 可选实现，支持回退时恢复内部状态 */
export interface ISnapshotable {
  snapshot(): Promise<unknown>; // 保存当前状态
  restore(state: unknown): Promise<void>; // 恢复到指定状态
}

/** Pipeline 步骤选项 — .add() 方法的参数 */
export interface StepOptions {
  /** 任务描述 */
  task: string;
  /** 输入数据(覆盖上一步输出) */
  input?: Record<string, unknown>;
  /** 超时(ms) */
  timeout?: number;
  /** 模型名(引用 ModelRegistry)或内联 ModelRef */
  model?: string | ModelRef;
  /** 输入转换函数 */
  transform?: (prevOutput: AgentResult) => unknown;
  /** 拦截器(在步骤执行后调用,可发出控制信号) */
  intercept?: (output: AgentResult, context: Record<string, unknown>) => PipelineControlSignal;
}

/** 并行步骤 — .parallel() 方法的参数 */
export interface ParallelStep {
  /** 步骤名(可选,用于日志) */
  name?: string;
  /** Agent 名 */
  agent: string;
  /** 任务描述 */
  task: string;
  /** 输入数据 */
  input?: Record<string, unknown>;
  /** 模型引用 */
  model?: string | ModelRef;
}

/** 拦截器处理器 — .intercept() 方法的参数 */
export interface InterceptorHandler {
  /** 拦截的步骤名 */
  stepName: string;
  /** 拦截回调 */
  handler: (output: AgentResult, context: Record<string, unknown>) => PipelineControlSignal | void;
}

/** 分叉分支 — .fork() 方法的参数 */
export interface ForkBranch {
  /** 分支名 */
  name: string;
  /** Agent 名 */
  agent: string;
  /** 任务描述 */
  task: string;
  /** 输入数据 */
  input?: Record<string, unknown>;
  /** 模型引用 */
  model?: string | ModelRef;
}
