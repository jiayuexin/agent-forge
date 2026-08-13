import { describe, it, expect, afterEach } from 'vitest';
import { AgentRuntimeClient } from '@agentforge/runtime-client';
import { createMockAgent } from '../../../runtime-client/__tests__/helpers.js';
import { startTestHub, requestJson } from '../helpers.js';

describe('Hub WebSocket integration', () => {
  let hubServer: Awaited<ReturnType<typeof startTestHub>>;

  afterEach(async () => {
    await hubServer.hub.stop();
  });

  it('connects a runtime client and executes a task over HTTP', async () => {
    hubServer = await startTestHub({ dataDir: `.agentforge/hub-test-${Date.now()}` });

    const tokenResponse = hubServer.hub.tokenStore.create({ nodeName: 'test-node' });
    await hubServer.hub.tokenStore.save();

    const agent = createMockAgent({ id: tokenResponse.nodeId });
    const runtime = new AgentRuntimeClient(agent, {
      hubUrl: `http://127.0.0.1:${hubServer.port}`,
      websocketUrl: `ws://127.0.0.1:${hubServer.port}`,
      authToken: tokenResponse.token,
      heartbeatInterval: 1000,
      allowRemoteExecution: true,
    });

    const executed = new Promise<unknown>((resolve) => {
      runtime.onTask(async (task) => {
        resolve(task.task.input);
        return {
          success: true,
          output: { content: 'ack' },
          meta: {
            duration: 0,
            tokensUsed: { input: 0, output: 0, total: 0 },
            model: 'mock',
          },
        };
      });
    });

    await runtime.start();

    const nodes = await requestJson(hubServer.port, '/api/nodes', hubServer.adminToken);
    expect(Array.isArray(nodes)).toBe(true);
    expect((nodes as Array<{ id: string }>).length).toBe(1);
    const nodeId = (nodes as Array<{ id: string }>)[0].id;

    const executePromise = requestJson(
      hubServer.port,
      `/api/nodes/${nodeId}/execute`,
      hubServer.adminToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', input: { message: 'hello' } }),
      }
    );

    await expect(executed).resolves.toEqual({ message: 'hello' });

    const result = await executePromise;
    expect(result).toMatchObject({
      success: true,
      output: { content: 'ack' },
    });

    await runtime.stop();
  });

  it('streams a ClientAgent chat task over HTTP', async () => {
    hubServer = await startTestHub({ dataDir: `.agentforge/hub-stream-${Date.now()}` });
    const { ClientAgent, MockProvider, ProviderFactory } = await import('@agentforge/core');
    if (!ProviderFactory.list().includes('mock')) {
      ProviderFactory.register('mock', MockProvider);
    }
    const tokenResponse = hubServer.hub.tokenStore.create({ nodeName: 'stream-node' });
    const agent = new ClientAgent({
      identity: {
        id: tokenResponse.nodeId,
        name: 'stream-node',
        role: 'assistant',
        version: '1.0.0',
      },
      model: { provider: 'mock', modelName: 'mock-model' },
      systemPrompt: 'stream test',
    });
    const runtime = new AgentRuntimeClient(agent, {
      hubUrl: `http://127.0.0.1:${hubServer.port}`,
      websocketUrl: `ws://127.0.0.1:${hubServer.port}`,
      authToken: tokenResponse.token,
      heartbeatInterval: 1000,
      allowRemoteExecution: true,
    });
    await runtime.start();
    try {
      const response = await fetch(
        `http://127.0.0.1:${hubServer.port}/api/v1/nodes/${tokenResponse.nodeId}/stream`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hubServer.adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type: 'chat', input: { message: 'hello-stream' } }),
        }
      );
      expect(response.ok).toBe(true);
      const text = await response.text();
      expect(text).toContain('hello-stream');
      expect(text).toContain('"type":"text"');
    } finally {
      await runtime.stop();
    }
  });
});
