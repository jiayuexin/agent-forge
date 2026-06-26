import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import type { AgentMessage, AgentResult } from '@agentforge/types';
import { NodeRegistry } from '../../server/services/NodeRegistry.js';
import { createTestServer } from '../../../runtime-client/__tests__/helpers.js';

describe('NodeRegistry', () => {
  let registry: NodeRegistry;
  let server: ReturnType<typeof createTestServer>;

  beforeEach(() => {
    registry = new NodeRegistry();
    server = createTestServer();
  });

  afterEach(async () => {
    registry.destroy();
    await server.close();
  });

  async function openClient(nodeId: string): Promise<{ client: WebSocket; serverWs: WebSocket }> {
    const client = new WebSocket(`${server.url}/ws/nodes/${nodeId}`);
    await new Promise<void>((resolve, reject) => {
      client.once('open', resolve);
      client.once('error', reject);
    });
    const serverWs = await server.nextClient();
    return { client, serverWs };
  }

  it('registers and lists a node', async () => {
    const { client, serverWs } = await openClient('node-a');
    registry.register('node-a', serverWs);

    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('node-a');

    client.close();
  });

  it('executes a task and receives result', async () => {
    const { client, serverWs } = await openClient('node-b');
    registry.register('node-b', serverWs);

    client.on('message', (data: WebSocket.RawData) => {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      const control = JSON.parse(text) as { messageId: string; type: string };
      if (control.type !== 'execute') return;

      const resultMessage: AgentMessage = {
        type: 'result',
        messageId: control.messageId,
        nodeId: 'node-b',
        timestamp: Date.now(),
        payload: {
          success: true,
          output: { content: 'hello back' },
          meta: {
            duration: 0,
            tokensUsed: { input: 0, output: 0, total: 0 },
            model: 'mock',
          },
        } as AgentResult,
      };
      client.send(JSON.stringify(resultMessage));
    });

    const result = await registry.execute('node-b', {
      type: 'chat',
      input: { message: 'hello' },
    });

    expect(result.success).toBe(true);
    expect(result.output.content).toBe('hello back');

    client.close();
  });

  it('distributes capability and receives ack', async () => {
    const { client, serverWs } = await openClient('node-c');
    registry.register('node-c', serverWs);

    client.on('message', (data: WebSocket.RawData) => {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      const control = JSON.parse(text) as { messageId: string; type: string };
      if (control.type !== 'capability-distribute') return;

      const ackMessage: AgentMessage = {
        type: 'capability-ack',
        messageId: control.messageId,
        nodeId: 'node-c',
        timestamp: Date.now(),
        payload: {
          messageId: control.messageId,
          capabilityId: 'cap-1',
          status: 'installed',
        },
      };
      client.send(JSON.stringify(ackMessage));
    });

    const results = await registry.distribute(['node-c'], {
      action: 'add',
      capability: {
        id: 'cap-1',
        type: 'tool',
        name: 'mock-tool',
        description: 'Mock tool',
      },
    });

    expect(results['node-c'].status).toBe('installed');

    client.close();
  });

  it('throws when node is not found', async () => {
    await expect(
      registry.execute('missing-node', { type: 'chat', input: {} })
    ).rejects.toThrow('missing-node');
  });
});
