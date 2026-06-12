/** @see docs/01-核心设计.md §1.6 */

import type { IAgent } from './agent';
import type { AgentConfig } from './config';
import type { ToolDefinition } from './config';
import type { AgentTask } from './task';
import type { AgentResult } from './result';

export interface Middleware {
  name: string;
  before?: (task: AgentTask) => Promise<AgentTask>;
  after?: (result: AgentResult, task: AgentTask) => Promise<AgentResult>;
  onError?: (error: Error, task: AgentTask) => Promise<AgentResult>;
}

/** 日志接口 — 插件和运行时使用的日志契约 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  /** 创建子 logger(带上下文字段) */
  child(context: Record<string, unknown>): Logger;
}

export interface PluginContext {
  registerTool(tool: ToolDefinition): void;
  registerMiddleware(middleware: Middleware): void;
  config: AgentConfig;
  logger: Logger;
}

export interface IPlugin {
  name: string;
  version: string;
  install(agent: IAgent, context: PluginContext): void;
  uninstall?(agent: IAgent): void;
}
