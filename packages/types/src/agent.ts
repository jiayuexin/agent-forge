/** @see docs/01-核心设计.md §1.1 */

import type { AgentConfig } from './config';
import type { AgentTask } from './task';
import type { AgentResult } from './result';
import type { IPlugin } from './plugin';
import type { JSONSchema } from './debug';

/** Agent 事件类型 — 字符串字面量联合,便于 IDE 自动补全 */
export type AgentEvent =
  | 'agent:init' // 初始化完成
  | 'agent:ready' // 就绪,等待任务
  | 'agent:execute:start' // 开始执行任务
  | 'agent:execute:end' // 任务执行完成
  | 'agent:tool:call' // 工具被调用前
  | 'agent:tool:result' // 工具返回结果
  | 'agent:llm:chunk' // LLM 流式输出一个 chunk
  | 'agent:llm:error' // LLM 调用失败
  | 'agent:error' // Agent 内部错误
  | 'agent:pause' // 暂停
  | 'agent:resume' // 恢复
  | 'agent:destroy'; // 销毁前

/** 事件处理器签名 */
export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

/** Agent 流式输出 chunk — Agent 层聚合,IProvider 层 chunk 不会直接暴露 */
export interface AgentStreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  toolResult?: {
    name: string;
    output: unknown;
  };
  error?: { code: string; message: string };
  /** chunk 序号,从 0 开始;done 类型时不递增 */
  index: number;
  /** 当前累计 token 数(输入+输出) */
  tokensUsed?: { input: number; output: number };
}

export enum AgentStatus {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  PAUSED = 'paused',
  ERROR = 'error',
  DESTROYED = 'destroyed',
}

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema?: JSONSchema;
  outputSchema?: JSONSchema;
}

export interface IAgent<TConfig extends AgentConfig = AgentConfig> {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly version: string;
  readonly capabilities: AgentCapability[];
  readonly status: AgentStatus;

  init(config: TConfig): Promise<void>;
  execute(task: AgentTask): Promise<AgentResult>;
  stream(task: AgentTask): AsyncIterable<AgentStreamChunk>;
  destroy(): Promise<void>;
  use(plugin: IPlugin): this;
  on(event: AgentEvent, handler: EventHandler): this;
  off(event: AgentEvent, handler: EventHandler): this;
}
