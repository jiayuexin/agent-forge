import { describe, it, expect, vi } from 'vitest';
import { ClientAgentProxy, RemoteAgentInvoker } from '../src/ClientAgentProxy.js';
import type { AgentResult, AgentStreamChunk, AgentTask } from '@agentforge/types';

describe('ClientAgentProxy', () => {
  it('execute delegates to invoker', async () => {
    const result: AgentResult = {
      success: true,
      output: { content: 'remote-result' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'remote' },
    };
    const invoker: RemoteAgentInvoker = {
      execute: vi.fn(async () => result),
    };

    const proxy = new ClientAgentProxy('node-1', invoker);
    const task: AgentTask = { type: 'chat', input: { message: 'hi' } };
    expect(await proxy.execute(task)).toEqual(result);
    expect(invoker.execute).toHaveBeenCalledWith('node-1', task);
  });

  it('stream delegates to invoker stream when available', async () => {
    const invoker: RemoteAgentInvoker = {
      execute: vi.fn(),
      stream: vi.fn(async function* () {
        yield { type: 'text', content: 'chunk', index: 0 } as AgentStreamChunk;
        yield { type: 'done', index: 1 } as AgentStreamChunk;
      }),
    };

    const proxy = new ClientAgentProxy('node-1', invoker);
    const chunks: AgentStreamChunk[] = [];
    for await (const chunk of proxy.stream({ type: 'chat', input: { message: 'hi' } })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(2);
  });

  it('stream falls back to execute when invoker lacks stream', async () => {
    const result: AgentResult = {
      success: true,
      output: { content: 'fallback' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'remote' },
    };
    const invoker: RemoteAgentInvoker = {
      execute: vi.fn(async () => result),
    };

    const proxy = new ClientAgentProxy('node-1', invoker);
    const chunks: AgentStreamChunk[] = [];
    for await (const chunk of proxy.stream({ type: 'chat', input: { message: 'hi' } })) {
      chunks.push(chunk);
    }
    expect(chunks[0]).toMatchObject({ type: 'text', content: 'fallback' });
    expect(chunks[1]).toMatchObject({ type: 'done' });
  });
});
