/**
 * Framework-level contract types.
 */

export type EventBusHandler = (...args: unknown[]) => void;

export interface EventBus {
  on(event: string, handler: EventBusHandler): this;
  once(event: string, handler: EventBusHandler): this;
  off(event: string, handler: EventBusHandler): this;
  removeAllListeners(event?: string): this;
  emit(event: string, data: unknown): void;
}

export interface ConnectToClientAgentOptions {
  hubUrl?: string;
  token?: string;
  timeout?: number;
}
