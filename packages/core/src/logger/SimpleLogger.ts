import type { Logger } from '@agentforge/types';

export class SimpleLogger implements Logger {
  private context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }

  debug(message: string, ...args: unknown[]): void {
    console.debug(message, ...args, this.context);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(message, ...args, this.context);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args, this.context);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(message, ...args, this.context);
  }

  child(context: Record<string, unknown>): Logger {
    return new SimpleLogger({ ...this.context, ...context });
  }
}
