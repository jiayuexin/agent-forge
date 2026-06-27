import type { Logger } from '@agentforge/types';
import pino from 'pino';

export class SimpleLogger implements Logger {
  private readonly logger: pino.Logger;
  private readonly context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = { ...context };
    const level =
      (context.level as string | undefined) ??
      process.env.LOG_LEVEL ??
      process.env.AGENTFORGE_LOG_LEVEL ??
      'info';
    this.logger = pino({
      level,
      base: this.context,
    });
  }

  debug(message: string, ...args: unknown[]): void {
    this.logger.debug({ args }, message);
  }

  info(message: string, ...args: unknown[]): void {
    this.logger.info({ args }, message);
  }

  warn(message: string, ...args: unknown[]): void {
    this.logger.warn({ args }, message);
  }

  error(message: string, ...args: unknown[]): void {
    this.logger.error({ args }, message);
  }

  child(context: Record<string, unknown>): Logger {
    return new SimpleLogger({ ...this.context, ...context });
  }
}
