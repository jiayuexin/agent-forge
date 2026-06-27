import type { AgentError, Artifact, ToolCallRecord } from './core.js';

/**
 * Agent execution result types.
 */

export interface AgentResult {
  success: boolean;
  output: {
    content: string;
    structured?: Record<string, unknown>;
    artifacts?: Artifact[];
  };
  meta: {
    duration: number;
    tokensUsed: {
      input: number;
      output: number;
      total: number;
    };
    model: string;
    toolsCalled?: ToolCallRecord[];
  };
  error?: AgentError;
}
