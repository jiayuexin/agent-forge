import type { EventBus as IEventBus, EventBusHandler } from '@agentforge/types';

export class EventBus implements IEventBus {
  private handlers = new Map<string, Set<EventBusHandler>>();

  on(event: string, handler: EventBusHandler): this {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return this;
  }

  once(event: string, handler: EventBusHandler): this {
    const wrapper: EventBusHandler = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, handler: EventBusHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event === undefined) {
      this.handlers.clear();
    } else {
      this.handlers.delete(event);
    }
    return this;
  }

  emit(event: string, data: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch {
        // Event bus errors should not break other handlers.
      }
    }
  }
}
