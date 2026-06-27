import { describe, it, expect } from 'vitest';
import type { AgentResult, AgentTask, Middleware } from '@agentforge/types';
import { MiddlewareChain } from '../MiddlewareChain.js';

describe('MiddlewareChain', () => {
  const task: AgentTask = { type: 'test', input: { value: 1 } };
  const result: AgentResult = {
    success: true,
    output: { content: 'ok' },
    meta: {
      duration: 0,
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'test',
    },
  };

  it('runs before middlewares in registration order', async () => {
    const chain = new MiddlewareChain();
    const order: number[] = [];

    chain.use({
      name: 'first',
      before: async (t) => {
        order.push(1);
        return t;
      },
    } as Middleware);

    chain.use({
      name: 'second',
      before: async (t) => {
        order.push(2);
        return t;
      },
    } as Middleware);

    await chain.runBefore(task);
    expect(order).toEqual([1, 2]);
  });

  it('runs after middlewares in reverse order', async () => {
    const chain = new MiddlewareChain();
    const order: number[] = [];

    chain.use({
      name: 'first',
      after: async (r) => {
        order.push(1);
        return r;
      },
    } as Middleware);

    chain.use({
      name: 'second',
      after: async (r) => {
        order.push(2);
        return r;
      },
    } as Middleware);

    await chain.runAfter(result, task);
    expect(order).toEqual([2, 1]);
  });

  it('recovers from errors via onError', async () => {
    const chain = new MiddlewareChain();

    chain.use({
      name: 'recover',
      onError: async () => result,
    } as Middleware);

    const recovered = await chain.runOnError(new Error('boom'), task);
    expect(recovered.success).toBe(true);
  });

  it('rethrows when no onError handles the error', async () => {
    const chain = new MiddlewareChain();
    await expect(chain.runOnError(new Error('boom'), task)).rejects.toThrow('boom');
  });
});
