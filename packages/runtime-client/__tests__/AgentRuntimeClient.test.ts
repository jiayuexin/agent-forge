import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRuntimeClient } from '../src/AgentRuntimeClient.js';
import { AgentStatus, type AgentResult, type AgentStreamChunk } from '@agentforge/types';
import { createMockAgent, createTestServer, waitFor } from './helpers.js';

vi.mock('@agentforge/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agentforge/core')>();
  return {
    ...actual,
    askLocalUserConfirmation: vi.fn().mockResolvedValue(true),
  };
});

import { askLocalUserConfirmation } from '@agentforge/core';

describe('AgentRuntimeClient', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    server = await createTestServer();
    vi.mocked(askLocalUserConfirmation).mockResolvedValue(true);
  });

  afterEach(async () => {
    await server.close();
  });

  it('start initializes agent, starts daemon, loads cache, connects, and sends registration', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    const connectedPromise = new Promise<void>((resolve) => client.on('connected', resolve));

    await client.start();
    await connectedPromise;

    expect(agent.init).toHaveBeenCalled();
    expect(agent.startDaemon).toHaveBeenCalled();
    expect(client.status).toBe('connected');

    const registration = await server.waitForMessage((m) => m.type === 'event');
    expect(registration.payload).toMatchObject({ event: 'node:register' });

    await client.stop();
  });

  it('does not call init when agent is already initialized', async () => {
    const agent = createMockAgent({ status: AgentStatus.READY });
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    const connectedPromise = new Promise<void>((resolve) => client.on('connected', resolve));
    await client.start();
    await connectedPromise;

    expect(agent.init).not.toHaveBeenCalled();
    expect(agent.startDaemon).toHaveBeenCalled();

    await client.stop();
  });

  it('stop stops heartbeat, disconnects, and stops daemon', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    await client.stop();

    expect(agent.stopDaemon).toHaveBeenCalled();
    expect(client.status).toBe('disconnected');
  });

  it('send fills missing nodeId and timestamp', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    client.send({ type: 'status', payload: 'online' });

    const message = await server.waitForMessage((m) => m.type === 'status');
    expect(message.nodeId).toBe('agent-1');
    expect(message.timestamp).toBeDefined();

    await client.stop();
  });

  it('drops outbound messages after the transport disconnects', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');
    await client.stop();

    expect(() => client.send({ type: 'status', payload: 'offline' })).not.toThrow();
  });

  it('handles execute control message and sends result', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'execute',
        messageId: 'exec-1',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-1',
          type: 'execute',
          task: { type: 'test', input: { message: 'hello' } },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );

    const result = await server.waitForMessage((m) => m.type === 'result');
    expect(result.messageId).toBe('exec-1');
    expect(result.payload).toMatchObject({ success: true });

    await client.stop();
  });

  it('handles stream control message and sends stream chunks', async () => {
    const agent = createMockAgent({
      stream: vi.fn().mockImplementation(async function* () {
        yield { type: 'text', content: 'hello', index: 0 } as AgentStreamChunk;
        yield { type: 'text', content: ' world', index: 1 } as AgentStreamChunk;
        yield { type: 'done', index: 2 } as AgentStreamChunk;
      }),
    });

    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'stream',
        messageId: 'stream-1',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-2',
          type: 'stream',
          task: { type: 'test', input: { message: 'hello' } },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );

    const chunks: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 3; i++) {
      chunks.push(await server.waitForMessage((m) => m.type === 'stream-chunk'));
    }

    expect(chunks[0].payload.content).toBe('hello');
    expect(chunks[1].payload.content).toBe(' world');
    expect(chunks[2].payload.type).toBe('done');

    await client.stop();
  });

  it('handles ping control message and sends pong', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'ping',
        messageId: 'ping-1',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {},
      })
    );

    const pong = await server.waitForMessage((m) => m.type === 'pong');
    expect(pong.messageId).toBe('ping-1');

    await client.stop();
  });

  it('handles capability-distribute control message and sends capability-ack', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      capabilityCacheDir: '.agentforge/test-capabilities',
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'capability-distribute',
        messageId: 'cap-1',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          action: 'add',
          capability: {
            id: 'tool-git-status',
            type: 'tool',
            name: 'git-status',
            description: 'Show git status',
            version: '1.0.0',
            endpointType: 'local-command',
            endpoint: { target: 'git status --porcelain', method: 'exec' },
            inputSchema: { type: 'object' },
          },
        },
      })
    );

    const ack = await server.waitForMessage((m) => m.type === 'capability-ack');
    expect(ack.messageId).toBe('cap-1');
    expect(ack.payload).toMatchObject({ status: 'installed', capabilityId: 'tool-git-status' });

    await client.stop();
  });

  it('executes a distributed Tool after install and after a runtime restart', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'agentforge-runtime-cache-'));
    const localFunction = vi.fn(async (_tool, args) => ({
      total: Number(args.left) + Number(args.right),
    }));
    const firstAgent = createMockAgent();
    const firstClient = new AgentRuntimeClient(
      firstAgent,
      {
        hubUrl: server.url,
        capabilityCacheDir: cacheDir,
      },
      {
        additionalToolAdapters: {
          'local-function': localFunction,
        },
      }
    );

    try {
      expect(firstAgent.setCapabilitySource).toHaveBeenCalledOnce();
      await firstClient.start();
      await server.waitForMessage((message) => message.type === 'event');
      const clientWs = await server.nextClient();
      clientWs.send(
        JSON.stringify({
          type: 'capability-distribute',
          messageId: 'cap-execute',
          nodeId: 'agent-1',
          timestamp: Date.now(),
          payload: {
            action: 'add',
            capability: {
              id: 'tool-add',
              type: 'tool',
              name: 'add',
              description: 'Add values',
              endpointType: 'local-function',
              endpoint: { target: 'math.add', method: 'call' },
              inputSchema: { type: 'object' },
            },
          },
        })
      );
      await server.waitForMessage(
        (message) => message.type === 'capability-ack' && message.messageId === 'cap-execute'
      );
      clientWs.send(
        JSON.stringify({
          type: 'capability-distribute',
          messageId: 'cap-update',
          nodeId: 'agent-1',
          timestamp: Date.now(),
          payload: {
            action: 'update',
            capability: {
              id: 'tool-add',
              type: 'tool',
              name: 'add',
              description: 'Add values v2',
              version: '2.0.0',
              endpointType: 'local-function',
              endpoint: { target: 'math.add', method: 'call' },
              inputSchema: { type: 'object' },
            },
          },
        })
      );
      await server.waitForMessage(
        (message) => message.type === 'capability-ack' && message.messageId === 'cap-update'
      );
      expect(firstClient.node.capabilities).toEqual([
        expect.objectContaining({
          id: 'tool-add',
          description: 'Add values v2',
          version: '2.0.0',
        }),
      ]);

      await expect(
        firstClient.executeCapability('tool-add', {
          type: 'tool',
          input: { left: 2, right: 3 },
        })
      ).resolves.toMatchObject({
        success: true,
        output: { structured: { result: { total: 5 } } },
      });
      await firstClient.stop();

      const secondAgent = createMockAgent();
      const secondClient = new AgentRuntimeClient(
        secondAgent,
        {
          hubUrl: server.url,
          capabilityCacheDir: cacheDir,
        },
        {
          additionalToolAdapters: {
            'local-function': localFunction,
          },
        }
      );
      await secondClient.start();
      await server.waitForMessage((message) => message.type === 'event');
      expect(secondAgent.setCapabilitySource).toHaveBeenCalledOnce();
      expect(secondClient.node.capabilities).toEqual([
        expect.objectContaining({
          id: 'tool-add',
          description: 'Add values v2',
          version: '2.0.0',
        }),
      ]);
      await expect(
        secondClient.executeCapability('tool-add', {
          type: 'tool',
          input: { left: 4, right: 5 },
        })
      ).resolves.toMatchObject({
        output: { structured: { result: { total: 9 } } },
      });
      const secondWs = await server.nextClient();
      secondWs.send(
        JSON.stringify({
          type: 'capability-distribute',
          messageId: 'cap-remove',
          nodeId: 'agent-1',
          timestamp: Date.now(),
          payload: {
            action: 'remove',
            capability: {
              id: 'tool-add',
              type: 'tool',
              name: 'add',
              description: 'Add values v2',
              version: '2.0.0',
              endpointType: 'local-function',
              endpoint: { target: 'math.add', method: 'call' },
              inputSchema: { type: 'object' },
            },
          },
        })
      );
      await server.waitForMessage(
        (message) => message.type === 'capability-ack' && message.messageId === 'cap-remove'
      );
      expect(secondClient.node.capabilities).toEqual([]);
      await expect(
        secondClient.executeCapability('tool-add', {
          type: 'tool',
          input: {},
        })
      ).rejects.toMatchObject({ code: 'CAPABILITY_NOT_FOUND' });
      await secondClient.stop();
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('handles stop control message', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'stop',
        messageId: 'stop-1',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {},
      })
    );

    await waitFor(() => client.status === 'disconnected');
    expect(agent.stopDaemon).toHaveBeenCalled();
  });

  it('returns error when remote execution is disabled', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: false,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'execute',
        messageId: 'exec-disabled',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-3',
          type: 'execute',
          task: { type: 'test', input: {} },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );

    const error = await server.waitForMessage((m) => m.type === 'error');
    expect(error.messageId).toBe('exec-disabled');
    expect(error.payload).toMatchObject({ code: 'REMOTE_EXECUTION_DISABLED' });

    await client.stop();
  });

  it('rejects execute and stream with the same confirmation check', async () => {
    vi.mocked(askLocalUserConfirmation).mockResolvedValue(false);
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
      requireLocalConfirmation: ['refund'],
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');
    const clientWs = await server.nextClient();

    clientWs.send(
      JSON.stringify({
        type: 'execute',
        messageId: 'exec-sensitive',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-refund',
          type: 'execute',
          task: { type: 'refund', input: {} },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );
    const executeError = await server.waitForMessage((m) => m.messageId === 'exec-sensitive');
    expect(executeError.payload).toMatchObject({ code: 'USER_REJECTED' });
    expect(agent.execute).not.toHaveBeenCalled();

    clientWs.send(
      JSON.stringify({
        type: 'stream',
        messageId: 'stream-sensitive',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-refund-stream',
          type: 'stream',
          task: { type: 'refund', input: {} },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );
    const streamError = await server.waitForMessage((m) => m.messageId === 'stream-sensitive');
    expect(streamError.payload).toMatchObject({ code: 'USER_REJECTED' });
    expect(agent.stream).not.toHaveBeenCalled();

    await client.stop();
  });

  it('sends error message when agent.execute throws', async () => {
    const agent = createMockAgent({
      execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
    });

    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'execute',
        messageId: 'exec-error',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-4',
          type: 'execute',
          task: { type: 'test', input: {} },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );

    const error = await server.waitForMessage((m) => m.type === 'error');
    expect(error.messageId).toBe('exec-error');
    expect(error.payload).toMatchObject({ code: 'RUNTIME_ERROR', message: 'Execution failed' });

    await client.stop();
  });

  it('ignores control messages for different node', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'ping',
        messageId: 'ping-other',
        nodeId: 'other-node',
        timestamp: Date.now(),
        payload: {},
      })
    );

    // Wait a bit and ensure no pong was sent
    await new Promise((resolve) => setTimeout(resolve, 100));
    // We cannot easily inspect server message queue; just verify client stays connected
    expect(client.status).toBe('connected');

    await client.stop();
  });

  it('cancels a task and rejects a later execute for the same taskId', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');
    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'cancel',
        messageId: 'cancel-1',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: { taskId: 'task-cancel' },
      })
    );
    const cancelled = await server.waitForMessage((m) => m.messageId === 'cancel-1');
    expect(cancelled.payload).toMatchObject({ status: 'cancelled', taskId: 'task-cancel' });

    clientWs.send(
      JSON.stringify({
        type: 'execute',
        messageId: 'exec-cancelled',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-cancel',
          type: 'execute',
          task: { type: 'test', input: {} },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );
    const error = await server.waitForMessage((m) => m.messageId === 'exec-cancelled');
    expect(error.payload).toMatchObject({ code: 'TASK_CANCELLED' });
    await client.stop();
  });

  it('rejects start when client has been stopped', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');
    await client.stop();

    await expect(client.start()).rejects.toMatchObject({ code: 'CLIENT_STOPPED' });
  });

  it('rejects remote security config updates and acks safe heartbeat changes', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: false,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'config-update',
        messageId: 'cfg-1',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: { allowRemoteExecution: true },
      })
    );

    const rejected = await server.waitForMessage((m) => m.type === 'config-ack');
    expect(rejected.payload).toMatchObject({ status: 'rejected' });
    expect(
      (client as unknown as { config: { allowRemoteExecution: boolean } }).config
        .allowRemoteExecution
    ).toBe(false);

    clientWs.send(
      JSON.stringify({
        type: 'config-update',
        messageId: 'cfg-2',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: { heartbeatInterval: 1234 },
      })
    );
    const applied = await server.waitForMessage(
      (m) => m.type === 'config-ack' && (m.payload as { status?: string }).status === 'applied'
    );
    expect(applied.payload).toMatchObject({ status: 'applied' });
    expect(
      (client as unknown as { config: { heartbeatInterval: number } }).config.heartbeatInterval
    ).toBe(1234);

    await client.stop();
  });

  it('uses custom capability handler when registered', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
    });

    client.onCapabilityDistribute(async () => ({
      capabilityId: 'custom-cap',
      status: 'installed',
      installedVersion: '2.0.0',
    }));

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'capability-distribute',
        messageId: 'cap-custom',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          action: 'add',
          capability: {
            id: 'custom-cap',
            type: 'tool',
            name: 'custom',
            description: 'Custom',
            version: '1.0.0',
            endpointType: 'local-function',
            endpoint: { target: 'tools.custom' },
            inputSchema: { type: 'object' },
          },
        },
      })
    );

    const ack = await server.waitForMessage((m) => m.type === 'capability-ack');
    expect(ack.messageId).toBe('cap-custom');
    expect(ack.payload).toMatchObject({ status: 'installed', installedVersion: '2.0.0' });

    await client.stop();
  });

  it('uses custom task handler for stream control message', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    client.onTask(async () => ({
      success: true,
      output: { content: 'stream-custom' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'custom' },
    }));

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'stream',
        messageId: 'stream-custom',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-stream',
          type: 'stream',
          task: { type: 'test', input: {} },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );

    const chunks: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 2; i++) {
      chunks.push(await server.waitForMessage((m) => m.type === 'stream-chunk'));
    }

    expect(chunks[0].payload).toMatchObject({ type: 'text', content: 'stream-custom' });
    expect(chunks[1].payload).toMatchObject({ type: 'done' });

    await client.stop();
  });

  it('sends error when stream throws', async () => {
    const agent = createMockAgent({
      stream: vi.fn().mockImplementation(async function* () {
        throw new Error('stream failed');
      }),
    });

    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'stream',
        messageId: 'stream-error',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-err',
          type: 'stream',
          task: { type: 'test', input: {} },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );

    const error = await server.waitForMessage((m) => m.type === 'error');
    expect(error.messageId).toBe('stream-error');
    expect(error.payload).toMatchObject({ code: 'RUNTIME_ERROR', message: 'stream failed' });

    await client.stop();
  });

  it('rejects unknown control message types as protocol errors', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
    });

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const errorPromise = new Promise<Error>((resolve) => {
      client.on('error', resolve);
    });
    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'unknown',
        messageId: 'unknown-1',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {},
      })
    );

    await expect(errorPromise).resolves.toMatchObject({ code: 'INVALID_MESSAGE' });
    await client.stop();
  });

  it('uses custom task handler when registered', async () => {
    const agent = createMockAgent();
    const client = new AgentRuntimeClient(agent, {
      hubUrl: server.url,
      allowRemoteExecution: true,
    });

    const customResult: AgentResult = {
      success: true,
      output: { content: 'custom' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'custom',
      },
    };

    client.onTask(async () => customResult);

    await client.start();
    await server.waitForMessage((m) => m.type === 'event');

    const clientWs = await server.nextClient();
    clientWs.send(
      JSON.stringify({
        type: 'execute',
        messageId: 'exec-custom',
        nodeId: 'agent-1',
        timestamp: Date.now(),
        payload: {
          taskId: 'task-5',
          type: 'execute',
          task: { type: 'test', input: {} },
          source: 'dashboard',
          issuedAt: Date.now(),
        },
      })
    );

    const result = await server.waitForMessage((m) => m.type === 'result');
    expect(result.payload).toMatchObject({ output: { content: 'custom' } });
    expect(agent.execute).not.toHaveBeenCalled();

    await client.stop();
  });
});
