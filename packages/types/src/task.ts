import type { Message } from './core.js';

/**
 * Task types passed to agents.
 */

export interface AgentTask {
  type: string;
  input: Record<string, unknown>;
  context?: {
    conversationId?: string;
    history?: Message[];
    userId?: string;
    metadata?: Record<string, unknown>;
  };
  meta?: {
    priority?: number;
    timeout?: number;
    traceId?: string;
  };
}
