import { pino, type Logger as PinoBaseLogger } from 'pino';
import type { Logger } from '@agentforge/types';

export class PinoLogger implements Logger {
  constructor(private readonly logger: PinoBaseLogger = pino({ name: 'agentforge-hub' })) {}

  debug(message: string, ...args: unknown[]): void {
    this.logger.debug(contextFromArgs(args), message);
  }

  info(message: string, ...args: unknown[]): void {
    this.logger.info(contextFromArgs(args), message);
  }

  warn(message: string, ...args: unknown[]): void {
    this.logger.warn(contextFromArgs(args), message);
  }

  error(message: string, ...args: unknown[]): void {
    this.logger.error(contextFromArgs(args), message);
  }

  child(context: Record<string, unknown>): Logger {
    return new PinoLogger(this.logger.child(context));
  }
}

function contextFromArgs(args: unknown[]): Record<string, unknown> {
  if (args.length === 0) {
    return {};
  }
  const [first, ...rest] = args;
  if (first instanceof Error) {
    return { err: first, ...(rest.length > 0 ? { args: rest } : {}) };
  }
  if (first && typeof first === 'object') {
    return { ...(first as Record<string, unknown>), ...(rest.length > 0 ? { args: rest } : {}) };
  }
  return { args };
}
