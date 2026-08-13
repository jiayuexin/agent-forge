import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { createMockAgent } from '../../../runtime-client/__tests__/helpers.js';
import { startTestHub, requestJson } from '../helpers.js';

async function connectRuntime(
  hubServer: Awaited<ReturnType<typeof startTestHub>>,
  overrides: { allowRemoteExecution?: boolean } = {}
) {
  const tokenResponse = hubServer.hub.tokenStore.create({ nodeName: 'protocol-node' });
  const agent = createMockAgent({ id: tokenResponse.nodeId });
  const runtime = new AgentRuntimeClient(agent, {
    hubUrl: `http://127.0.0.1:${hubServer.port}`,
    websocketUrl: `ws://127.0.0.1:${hubServer.port}`,
    authToken: tokenResponse.token,
    heartbeatInterval: 1000,
    reconnect: { enabled: true, maxAttempts: 5, delayMs: 50, backoffMultiplier: 1 },
    allowRemoteExecution: overrides.allowRemoteExecution ?? true,
  });
  await runtime.start();
  return { runtime, nodeId: tokenResponse.nodeId as string, token: tokenResponse.token };
}

describe('Hub protocol integration', () => {
  let hubServer: Awaited<ReturnType<typeof startTestHub>>;

  afterEach(async () => {
    await hubServer.hub.stop();
  });

  it('reconnects a ClientAgent and continues executing', async () => {
    hubServer = await startTestHub();
    const { runtime, nodeId } = await connectRuntime(hubServer);
    try {
      hubServer.hub.nodeRegistry.get(nodeId)?.close();
      await waitUntil(() => !hubServer.hub.nodeRegistry.get(nodeId));
      await waitUntil(() => Boolean(hubServer.hub.nodeRegistry.get(nodeId)));

      const result = await requestJson(
        hubServer.port,
        `/api/v1/nodes/${nodeId}/execute`,
        hubServer.adminToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'chat', input: { message: 'after-reconnect' } }),
        }
      );
      expect(result).toMatchObject({ success: true });
    } finally {
      await runtime.stop();
    }
  });

  it('returns a cached result for duplicate tasks', async () => {
    hubServer = await startTestHub();
    const { runtime, nodeId } = await connectRuntime(hubServer);
    let executions = 0;
    runtime.onTask(async () => {
      executions += 1;
      return {
        success: true,
        output: { content: `run-${executions}` },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      };
    });

    const body = {
      method: 'POST' as const,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'chat', input: { message: 'same' } }),
    };
    const first = await requestJson(
      hubServer.port,
      `/api/v1/nodes/${nodeId}/execute`,
      hubServer.adminToken,
      body
    );
    const second = await requestJson(
      hubServer.port,
      `/api/v1/nodes/${nodeId}/execute`,
      hubServer.adminToken,
      body
    );
    expect(first).toMatchObject({ output: { content: 'run-1' } });
    expect(second).toMatchObject({ output: { content: 'run-1' } });
    expect(executions).toBe(1);
    await runtime.stop();
  });

  it('marks timed-out tasks as unknown', async () => {
    hubServer = await startTestHub();
    const { runtime, nodeId } = await connectRuntime(hubServer);
    runtime.onTask(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        success: true,
        output: { content: 'late' },
        meta: { duration: 400, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      };
    });
    const session = hubServer.hub.nodeRegistry.get(nodeId);
    await expect(
      session!.execute(
        {
          taskId: 'timeout-task',
          idempotencyKey: 'timeout-key',
          type: 'execute',
          task: { type: 'chat', input: {} },
          source: 'hub',
          issuedAt: Date.now(),
        },
        50
      )
    ).rejects.toMatchObject({ code: 'TASK_UNKNOWN' });
    await runtime.stop();
  });

  it('cancels an inflight task', async () => {
    hubServer = await startTestHub();
    const { runtime, nodeId } = await connectRuntime(hubServer);
    runtime.onTask(async (task) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        success: true,
        output: { content: task.taskId },
        meta: { duration: 200, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
      };
    });
    const session = hubServer.hub.nodeRegistry.get(nodeId)!;
    const executePromise = session.execute({
      taskId: 'cancel-me',
      type: 'execute',
      task: { type: 'chat', input: {} },
      source: 'hub',
      issuedAt: Date.now(),
    });
    await session.cancel('cancel-me');
    await expect(executePromise).rejects.toThrow(/TASK_CANCELLED/);
    await runtime.stop();
  });

  it('rejects incompatible WebSocket protocol versions', async () => {
    hubServer = await startTestHub();
    const token = hubServer.hub.tokenStore.create({ nodeName: 'bad-protocol' });
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${hubServer.port}/ws/nodes/${token.nodeId}`, [
        'agentforge.v99',
        `agentforge.bearer.${token.token}`,
      ]);
      ws.on('open', () => {
        ws.close();
        reject(new Error('incompatible protocol should not connect'));
      });
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
    });
  });

  it('rejects remote security field updates over the protocol', async () => {
    hubServer = await startTestHub();
    const { runtime, nodeId } = await connectRuntime(hubServer, { allowRemoteExecution: false });
    const session = hubServer.hub.nodeRegistry.get(nodeId)!;
    await expect(session.updateConfig({ allowRemoteExecution: true } as never)).rejects.toThrow(
      /security fields/
    );
    expect(
      (runtime as unknown as { config: { allowRemoteExecution: boolean } }).config
        .allowRemoteExecution
    ).toBe(false);
    await runtime.stop();
  });
});

async function waitUntil(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for condition');
}
