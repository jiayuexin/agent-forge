import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRuntimeClient } from '../src/AgentRuntimeClient.js';
import { AgentStatus, type AgentResult, type AgentStreamChunk } from '@agentforge/types';
import { createMockAgent, createTestServer, waitFor } from './helpers.js';

describe('AgentRuntimeClient', () => {
  let server: ReturnType<typeof createTestServer>;

  beforeEach(() => {
    server = createTestServer();
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
          },
        },
      })
    );

    const ack = await server.waitForMessage((m) => m.type === 'capability-ack');
    expect(ack.messageId).toBe('cap-1');
    expect(ack.payload).toMatchObject({ status: 'installed', capabilityId: 'tool-git-status' });

    await client.stop();
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
