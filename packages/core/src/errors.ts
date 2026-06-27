import type { AgentError } from '@agentforge/types';

export class CoreError extends Error implements AgentError {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'CoreError';
    this.code = code;
    this.details = details;
  }
}
