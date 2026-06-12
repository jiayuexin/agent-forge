/** @see docs/01-核心设计.md §1.11 */

import type { ModelRegistry } from './provider';
import type { IAgent } from './agent';
import type { AgentConfig } from './config';
import type { AgentTask } from './task';
import type { AgentResult } from './result';
import type { PipelineConfig } from './pipeline';
import type { PipelineResult } from './pipeline';
import type { StepOptions } from './pipeline';
import type { ParallelStep } from './pipeline';
import type { InterceptorHandler } from './pipeline';
import type { ForkBranch } from './pipeline';

/** AgentFramework 配置 */
export interface FrameworkConfig {
  /** 模型注册表(可选,不配置时 Agent 各自管理 ModelConfig) */
  modelRegistry?: ModelRegistry;
  /** 日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  /** 全局默认输出目录(生成 Agent 的存放路径) */
  outputDir?: string;
}

/** Pipeline 链式构建器 — 由 AgentFramework.pipeline() 返回 */
export interface Pipeline {
  add(agentName: string, step: StepOptions): this;
  parallel(steps: ParallelStep[]): this;
  branch(condition: (prevOutput: AgentResult) => StepOptions | Pipeline): this;
  transform(fn: (prevOutput: AgentResult) => unknown): this;
  intercept(stepName: string, handler: (output: AgentResult, context: Record<string, unknown>) => PipelineResult): this;
  fork(stepName: string, branches: ForkBranch[]): this;
  config(options: PipelineConfig): this;
  run(): Promise<PipelineResult>;
}

export interface AgentFramework {
  register(name: string, AgentClass: new () => IAgent): this;
  get(name: string): IAgent;
  init(config: AgentConfig): Promise<void>;
  run(name: string, task: AgentTask): Promise<AgentResult>;
  pipeline(name?: string): Pipeline;
  on(event: string, handler: (...args: unknown[]) => void): this;
  once(event: string, handler: (...args: unknown[]) => void): this;
  off(event: string, handler: (...args: unknown[]) => void): this;
  emit(event: string, data: unknown): void;
}
