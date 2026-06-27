import type { IAgent, AgentTask, AgentResult, AgentStreamChunk, AgentStatus, AgentCapability } from '@agentforge/types';
import { AgentStatus as Status } from '@agentforge/types';
import { createDebugServer, type DebugServer } from '../src/server.js';

export interface MockAgentOptions {
  id?: string;
  name?: string;
  role?: string;
  version?: string;
  capabilities?: AgentCapability[];
  status?: AgentStatus;
  executeHandler?: (task: AgentTask) => Promise<AgentResult>;
  streamHandler?: (task: AgentTask) => AsyncIterable<AgentStreamChunk>;
}

export class MockAgent implements IAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly version: string;
  readonly capabilities: AgentCapability[];
  status: AgentStatus;
  private executeHandler: (task: AgentTask) => Promise<AgentResult>;
  private streamHandler: (task: AgentTask) => AsyncIterable<AgentStreamChunk>;

  constructor(options: MockAgentOptions = {}) {
    this.id = options.id ?? 'agent-1';
    this.name = options.name ?? 'mock-agent';
    this.role = options.role ?? 'assistant';
    this.version = options.version ?? '1.0.0';
    this.capabilities = options.capabilities ?? [];
    this.status = options.status ?? Status.READY;
    this.executeHandler =
      options.executeHandler ??
      (async () => ({
        success: true,
        output: { content: 'mock result' },
        meta: {
          duration: 0,
          tokensUsed: { input: 0, output: 0, total: 0 },
          model: 'mock',
        },
      }));
    this.streamHandler =
      options.streamHandler ??
      (async function* () {
        yield { type: 'text', content: 'mock chunk', index: 0 };
        yield { type: 'done', index: 1 };
      });
  }

  async init(): Promise<void> {
    this.status = Status.READY;
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    return this.executeHandler(task);
  }

  async *stream(task: AgentTask): AsyncIterable<AgentStreamChunk> {
    yield* this.streamHandler(task);
  }

  async destroy(): Promise<void> {
    this.status = Status.DESTROYED;
  }

  use(): this {
    return this;
  }

  on(): this {
    return this;
  }

  off(): this {
    return this;
  }
}

export async function startTestServer(agent: IAgent): Promise<{ server: DebugServer; port: number }> {
  const debugServer = createDebugServer(agent, {
    port: 0,
    host: '127.0.0.1',
  });

  await new Promise<void>((resolve, reject) => {
    debugServer.server.once('error', reject);
    debugServer.server.once('listening', () => {
      debugServer.server.off('error', reject);
      resolve();
    });
    debugServer.server.listen(0, '127.0.0.1');
  });

  const address = debugServer.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server: debugServer, port };
}

export async function requestJson(port: number, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
