import type { IAgent } from './agent.js';
import type { Capability } from './capability.js';
import type { AgentConfig } from './config.js';
import type { Logger } from './core.js';
import type { ToolDefinition } from './tool.js';

/**
 * Plugin and middleware contract types.
 */

export interface IPlugin {
  name: string;
  version: string;
  install(agent: IAgent, context: PluginContext): void;
  uninstall?(agent: IAgent): void;
  capabilities?(): Capability[];
}

export interface PluginContext {
  registerTool(tool: ToolDefinition): void;
  registerMiddleware(middleware: Middleware): void;
  config: AgentConfig;
  logger: Logger;
}

export interface Middleware {
  name: string;
  before?: (task: import('./task.js').AgentTask) => Promise<import('./task.js').AgentTask>;
  after?: (
    result: import('./result.js').AgentResult,
    task: import('./task.js').AgentTask
  ) => Promise<import('./result.js').AgentResult>;
  onError?: (error: Error, task: import('./task.js').AgentTask) => Promise<import('./result.js').AgentResult>;
}

export type { MiddlewareConfig } from './config.js';
