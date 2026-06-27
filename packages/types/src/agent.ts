import type {
  AgentCapability,
  AgentEvent,
  AgentStatus,
  AgentStreamChunk,
  EventHandler,
} from './core.js';
import type { AgentConfig } from './config.js';
import type { IPlugin } from './plugin.js';
import type { AgentResult } from './result.js';
import type { AgentTask } from './task.js';

/**
 * Core agent interface. All agent implementations must satisfy this contract.
 */

export interface IAgent<TConfig extends AgentConfig = AgentConfig> {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly version: string;
  readonly capabilities: AgentCapability[];
  readonly status: AgentStatus;

  init(config?: TConfig): Promise<void>;
  execute(task: AgentTask): Promise<AgentResult>;
  stream(task: AgentTask): AsyncIterable<AgentStreamChunk>;
  destroy(): Promise<void>;
  use(plugin: IPlugin): this;
  on(event: AgentEvent, handler: EventHandler): this;
  off(event: AgentEvent, handler: EventHandler): this;
}
