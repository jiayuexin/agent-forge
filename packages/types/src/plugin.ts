/**
 * Middleware contract types.
 */

export interface Middleware {
  name: string;
  before?: (task: import('./task.js').AgentTask) => Promise<import('./task.js').AgentTask>;
  after?: (
    result: import('./result.js').AgentResult,
    task: import('./task.js').AgentTask
  ) => Promise<import('./result.js').AgentResult>;
  onError?: (
    error: Error,
    task: import('./task.js').AgentTask
  ) => Promise<import('./result.js').AgentResult>;
}
