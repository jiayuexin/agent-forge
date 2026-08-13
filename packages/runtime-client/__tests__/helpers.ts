import type { AddressInfo } from 'node:net';
import type { AgentResult, AgentStreamChunk, IClientAgent } from '@agentforge/types';
import { AgentStatus, HUB_WS_SUBPROTOCOL } from '@agentforge/types';
import { WebSocketServer, WebSocket } from 'ws';
import { vi } from 'vitest';

export function createMockAgent(overrides?: Partial<IClientAgent>): IClientAgent {
  const agent: IClientAgent = {
    id: 'agent-1',
    name: 'test-agent',
    role: 'test',
    version: '1.0.0',
    capabilities: [],
    status: AgentStatus.UNINITIALIZED,
    init: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: { content: 'ok' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'mock',
      },
    } as AgentResult),
    stream: vi.fn().mockImplementation(async function* () {
      yield { type: 'text', content: 'ok', index: 0 } as AgentStreamChunk;
      yield { type: 'done', index: 1 } as AgentStreamChunk;
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    startDaemon: vi.fn().mockResolvedValue(undefined),
    stopDaemon: vi.fn().mockResolvedValue(undefined),
    connectToHub: vi.fn().mockResolvedValue(undefined),
    disconnectFromHub: vi.fn().mockResolvedValue(undefined),
    getLocalCapabilityCache: vi.fn().mockReturnValue([]),
    setCapabilitySource: vi.fn(),
    executeLocalCapability: vi.fn().mockResolvedValue({
      success: true,
      output: { content: 'local' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'mock',
      },
    } as AgentResult),
    executeScopedTask: vi.fn().mockResolvedValue({
      success: true,
      output: { content: 'scoped' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'mock',
      },
    } as AgentResult),
    authorizeLocalCommand: vi.fn().mockResolvedValue(undefined),
    getLocalCommandAuthorization: vi.fn().mockReturnValue('disabled'),
    ...overrides,
  };

  return agent;
}

export interface TestServer {
  wss: WebSocketServer;
  url: string;
  close(): Promise<void>;
  nextClient(): Promise<WebSocket>;
  waitForMessage(
    predicate?: (message: Record<string, unknown>) => boolean
  ): Promise<Record<string, unknown>>;
}

export async function createTestServer(): Promise<TestServer> {
  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    handleProtocols: (protocols) =>
      protocols.has(HUB_WS_SUBPROTOCOL) ? HUB_WS_SUBPROTOCOL : false,
  });
  const clients: WebSocket[] = [];
  const messageQueue: Array<Record<string, unknown>> = [];
  let messageResolver: ((message: Record<string, unknown>) => void) | undefined;

  await new Promise<void>((resolve, reject) => {
    wss.once('listening', () => resolve());
    wss.once('error', reject);
  });

  wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (messageResolver) {
        const resolve = messageResolver;
        messageResolver = undefined;
        resolve(parsed);
      } else {
        messageQueue.push(parsed);
      }
    });
  });

  return {
    wss,
    get url() {
      const address = wss.address() as AddressInfo;
      return `ws://127.0.0.1:${address.port}`;
    },
    close: () =>
      new Promise((resolve) => {
        for (const client of wss.clients) {
          client.terminate();
        }
        for (const ws of clients) {
          ws.terminate();
        }
        wss.close(() => resolve());
      }),
    nextClient: () =>
      new Promise<WebSocket>((resolve) => {
        if (clients.length > 0) {
          resolve(clients[clients.length - 1]);
          return;
        }
        wss.once('connection', (ws) => resolve(ws));
      }),
    waitForMessage: (predicate) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const check = () => {
          const index = predicate
            ? messageQueue.findIndex(predicate)
            : messageQueue.length > 0
              ? 0
              : -1;
          if (index >= 0) {
            const [message] = messageQueue.splice(index, 1);
            resolve(message);
            return;
          }
          messageResolver = (message: Record<string, unknown>) => {
            if (!predicate || predicate(message)) {
              resolve(message);
            } else {
              messageQueue.push(message);
              check();
            }
          };
        };
        check();
      }),
  };
}

export function waitFor(predicate: () => boolean, timeout = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error('Timeout waiting for condition'));
      }
    }, 10);
  });
}

// Re-export vi for test files that may not import it directly
export { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
