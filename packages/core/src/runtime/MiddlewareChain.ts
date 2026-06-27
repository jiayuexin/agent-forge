import type { AgentResult, AgentTask, Middleware } from '@agentforge/types';

export class MiddlewareChain {
  private middlewares: Middleware[] = [];

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  async runBefore(task: AgentTask): Promise<AgentTask> {
    let current = task;
    for (const middleware of this.middlewares) {
      if (middleware.before) {
        current = await middleware.before(current);
      }
    }
    return current;
  }

  async runAfter(result: AgentResult, task: AgentTask): Promise<AgentResult> {
    let current = result;
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      if (middleware.after) {
        current = await middleware.after(current, task);
      }
    }
    return current;
  }

  async runOnError(error: Error, task: AgentTask): Promise<AgentResult> {
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      if (middleware.onError) {
        return await middleware.onError(error, task);
      }
    }
    throw error;
  }
}
