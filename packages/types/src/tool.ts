import type { IAgent } from './agent.js';
import type { JSONSchema, Logger } from './core.js';

/**
 * Tool definition and handler types.
 */

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<unknown>;

export interface ToolContext {
  agent: IAgent;
  logger: Logger;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  required?: boolean;
  handler?: ToolHandler;
  endpointType?: 'local-command' | 'local-function' | 'http' | 'remote-agent';
  endpoint?: {
    target: string;
    method?: 'exec' | 'call' | 'post' | 'get';
  };
}
