type Handler = (...args: unknown[]) => void | Promise<void>;

/**
 * Simple typed event bus for pub/sub communication.
 * Used by AgentFramework for loose-coupling between agents and external code.
 */
export class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  /** Subscribe to an event. Returns `this` for chaining. */
  on(event: string, handler: Handler): this {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return this;
  }

  /** Subscribe to an event only once. The handler is removed after first invocation. */
  once(event: string, handler: Handler): this {
    const wrapper: Handler = (...args) => {
      this.off(event, wrapper);
      return handler(...args);
    };
    return this.on(event, wrapper);
  }

  /** Unsubscribe a handler from an event. */
  off(event: string, handler: Handler): this {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
    return this;
  }

  /** Emit an event, invoking all handlers synchronously. */
  emit(event: string, ...args: unknown[]): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(...args);
        } catch {
          // event handlers must not break the emitter
        }
      }
    }
  }

  /** Remove all listeners for a specific event, or all events if no event is specified. */
  removeAllListeners(event?: string): this {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
    return this;
  }
}
