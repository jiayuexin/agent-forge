import type { Middleware, AgentTask, AgentResult } from '@agentforge/types';

/**
 * Ordered chain of middleware that can transform tasks before execution
 * and results after execution. Supports before/after/onError hooks.
 */
export class MiddlewareChain {
  private readonly _middlewares: Middleware[] = [];

  get middlewares(): ReadonlyArray<Middleware> {
    return this._middlewares;
  }

  /** Add a middleware to the chain. Returns `this` for fluent API. */
  use(middleware: Middleware): this {
    this._middlewares.push(middleware);
    return this;
  }

  /**
   * Run all `before()` hooks in insertion order.
   * Each middleware receives the task (potentially transformed by the previous)
   * and must return the (possibly modified) task.
   */
  async runBefore(task: AgentTask): Promise<AgentTask> {
    let current: AgentTask = task;
    for (const mw of this._middlewares) {
      if (mw.before) {
        current = await mw.before(current);
      }
    }
    return current;
  }

  /**
   * Run all `after()` hooks in reverse insertion order.
   * Each middleware receives the result (potentially transformed by the previous)
   * and the original task, and must return the (possibly modified) result.
   */
  async runAfter(result: AgentResult, task: AgentTask): Promise<AgentResult> {
    let current: AgentResult = result;
    for (let i = this._middlewares.length - 1; i >= 0; i--) {
      const mw = this._middlewares[i];
      if (mw.after) {
        current = await mw.after(current, task);
      }
    }
    return current;
  }

  /**
   * Run `onError()` hooks in reverse insertion order.
   * The first middleware that successfully returns an AgentResult handles the error.
   * If no middleware handles it, the error is rethrown.
   */
  async runOnError(error: Error, task: AgentTask): Promise<AgentResult> {
    for (let i = this._middlewares.length - 1; i >= 0; i--) {
      const mw = this._middlewares[i];
      if (mw.onError) {
        try {
          return await mw.onError(error, task);
        } catch {
          // This middleware chose not to handle it; try the next one
          continue;
        }
      }
    }
    // No middleware handled the error — rethrow
    throw error;
  }

  /** Remove all middlewares from the chain. */
  clear(): void {
    this._middlewares.length = 0;
  }
}
