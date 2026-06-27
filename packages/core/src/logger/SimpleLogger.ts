import type { Logger } from '@agentforge/types';

export class SimpleLogger implements Logger {
  private readonly context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = { ...context };
  }

  debug(message: string, ...args: unknown[]): void {
    this.write('debug', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.write('info', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write('warn', message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.write('error', message, args);
  }

  child(context: Record<string, unknown>): Logger {
    return new SimpleLogger({ ...this.context, ...context });
  }

  private write(level: string, message: string, args: unknown[]): void {
    const payload = {
      level,
      time: new Date().toISOString(),
      message,
      ...this.context,
      ...(args.length > 0 ? { args } : {}),
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}
