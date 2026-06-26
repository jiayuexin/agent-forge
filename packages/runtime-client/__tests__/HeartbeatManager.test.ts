import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketTransport } from '../src/WebSocketTransport.js';
import { HeartbeatManager } from '../src/HeartbeatManager.js';
import { createTestServer, waitFor } from './helpers.js';

describe('HeartbeatManager', () => {
  let server: ReturnType<typeof createTestServer>;
  let transport: WebSocketTransport;

  beforeEach(async () => {
    server = createTestServer();
    transport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: server.url,
    });
    await transport.connect();
  });

  afterEach(async () => {
    transport.disconnect();
    await server.close();
  });

  it('sends a heartbeat immediately on start', async () => {
    const manager = new HeartbeatManager(transport, {
      intervalMs: 1000,
      produce: () => ({
        type: 'status',
        nodeId: 'node-1',
        timestamp: Date.now(),
        payload: 'online',
      }),
    });

    manager.start();

    const message = await server.waitForMessage((m) => m.type === 'status');
    expect(message.type).toBe('status');

    manager.stop();
  });

  it('sends heartbeats periodically', async () => {
    const manager = new HeartbeatManager(transport, {
      intervalMs: 50,
      produce: () => ({
        type: 'status',
        nodeId: 'node-1',
        timestamp: Date.now(),
        payload: 'online',
      }),
    });

    manager.start();

    const first = await server.waitForMessage((m) => m.type === 'status');
    expect(first.type).toBe('status');

    const second = await server.waitForMessage((m) => m.type === 'status');
    expect(second.type).toBe('status');

    manager.stop();
  });

  it('stops sending after stop', async () => {
    let sent = 0;
    const manager = new HeartbeatManager(transport, {
      intervalMs: 50,
      produce: () => {
        sent += 1;
        return {
          type: 'status',
          nodeId: 'node-1',
          timestamp: Date.now(),
          payload: 'online',
        };
      },
    });

    manager.start();
    await server.waitForMessage((m) => m.type === 'status');
    manager.stop();

    const countAfterStop = sent;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(sent).toBe(countAfterStop);
  });

  it('restarts when transport reconnects', async () => {
    const manager = new HeartbeatManager(transport, {
      intervalMs: 50,
      produce: () => ({
        type: 'status',
        nodeId: 'node-1',
        timestamp: Date.now(),
        payload: 'online',
      }),
    });

    manager.start();
    await server.waitForMessage((m) => m.type === 'status');

    await server.close();
    await waitFor(() => transport.status === 'disconnected');

    const newServer = createTestServer();
    transport.disconnect();

    // Reconnect transport manually to new server
    const newTransport = new WebSocketTransport({
      nodeId: 'node-1',
      hubUrl: newServer.url,
    });
    const newManager = new HeartbeatManager(newTransport, {
      intervalMs: 50,
      produce: () => ({
        type: 'status',
        nodeId: 'node-1',
        timestamp: Date.now(),
        payload: 'online',
      }),
    });

    newManager.start();
    await newTransport.connect();

    const message = await newServer.waitForMessage((m) => m.type === 'status');
    expect(message.type).toBe('status');

    newTransport.disconnect();
    await newServer.close();
  });
});
