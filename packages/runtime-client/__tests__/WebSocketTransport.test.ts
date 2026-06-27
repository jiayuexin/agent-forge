import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketTransport } from '../src/WebSocketTransport.js';
import { createTestServer, waitFor } from './helpers.js';

describe('WebSocketTransport', () => {
  let server: ReturnType<typeof createTestServer>;

  beforeEach(() => {
    server = createTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('connects to a WebSocket server and emits open', async () => {
    const transport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: server.url,
    });

    let opened = false;
    transport.on('open', () => {
      opened = true;
    });

    await transport.connect();

    expect(transport.status).toBe('connected');
    expect(opened).toBe(true);

    transport.disconnect();
  });

  it('sends an AgentMessage and the server receives it', async () => {
    const transport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: server.url,
    });

    await transport.connect();

    transport.send({
      type: 'status',
      nodeId: 'node-1',
      timestamp: Date.now(),
      payload: 'online',
    });

    const message = await server.waitForMessage();
    expect(message.type).toBe('status');
    expect(message.payload).toBe('online');

    transport.disconnect();
  });

  it('receives a ControlMessage and emits message event', async () => {
    const transport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: server.url,
    });

    const received = new Promise<Record<string, unknown>>((resolve) => {
      transport.on('message', (message) => resolve(message as unknown as Record<string, unknown>));
    });

    await transport.connect();
    const client = await server.nextClient();

    client.send(
      JSON.stringify({
        type: 'ping',
        messageId: 'msg-1',
        nodeId: 'node-1',
        timestamp: Date.now(),
        payload: {},
      })
    );

    const message = await received;
    expect(message.type).toBe('ping');
    expect(message.messageId).toBe('msg-1');

    transport.disconnect();
  });

  it('does not reconnect after intentional disconnect', async () => {
    const transport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: server.url,
      reconnect: {
        enabled: true,
        maxAttempts: 10,
        delayMs: 10,
        backoffMultiplier: 1,
      },
    });

    await transport.connect();
    expect(transport.status).toBe('connected');

    transport.disconnect();
    expect(transport.status).toBe('disconnected');

    // Give potential reconnect timers time to fire
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(transport.status).toBe('disconnected');
  });

  it('stops reconnecting after maxAttempts and reports error', async () => {
    const transport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: 'ws://localhost:1',
      reconnect: {
        enabled: true,
        maxAttempts: 2,
        delayMs: 10,
        backoffMultiplier: 1,
      },
    });

    const errors: Error[] = [];
    transport.on('error', (error) => errors.push(error));

    await expect(transport.connect()).rejects.toBeTruthy();
    await waitFor(() => transport.status === 'error', 3000);

    expect(transport.status).toBe('error');
    const lastError = errors[errors.length - 1];
    expect(lastError?.message).toContain('Failed to reconnect');

    transport.disconnect();
  });

  it('disconnect prevents reconnection', async () => {
    const transport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: server.url,
      reconnect: {
        enabled: true,
        maxAttempts: 10,
        delayMs: 10,
        backoffMultiplier: 1,
      },
    });

    await transport.connect();
    transport.disconnect();

    expect(transport.status).toBe('disconnected');

    await server.close();
    // Give some time to ensure no reconnection attempt happens
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(transport.status).toBe('disconnected');
  });

  it('throws when sending while disconnected', async () => {
    const transport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: server.url,
    });

    expect(() =>
      transport.send({
        type: 'status',
        nodeId: 'node-1',
        timestamp: Date.now(),
        payload: 'online',
      })
    ).toThrow('TRANSPORT_NOT_CONNECTED');
  });
});
