import { describe, expect, it, vi } from 'vitest';
import { AgentStatus } from '@agentforge/types';
import type {
  AgentResult,
  AgentStreamChunk,
  IClientAgent,
  ToolContext,
  ToolDefinition,
} from '@agentforge/types';
import { createRuntimeToolAdapters } from '../src/RuntimeToolAdapters.js';

const context = { agent: createAgent(), logger: console } as unknown as ToolContext;

describe('createRuntimeToolAdapters', () => {
  it('authorizes and executes a fixed local command without interpolating arguments', async () => {
    const agent = createAgent();
    const commandExecutor = vi.fn(async () => ({
      stdout: ' M file.ts\n',
      stderr: '',
    }));
    const adapters = createRuntimeToolAdapters(agent, { commandExecutor });
    const tool: ToolDefinition = {
      name: 'git-status',
      description: 'Show git status',
      parameters: { type: 'object' },
      endpointType: 'local-command',
      endpoint: { target: 'git status --porcelain', method: 'exec' },
    };

    await expect(
      adapters['local-command']!(tool, { cwd: '/workspace', injected: '; rm -rf /' }, context)
    ).resolves.toEqual({ stdout: ' M file.ts\n', stderr: '' });
    expect(agent.authorizeLocalCommand).toHaveBeenCalledWith(tool.endpoint?.target);
    expect(commandExecutor).toHaveBeenCalledWith('git status --porcelain', {
      cwd: '/workspace',
    });
  });

  it('executes an HTTP GET with task arguments encoded as query parameters', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        })
    );
    const adapters = createRuntimeToolAdapters(createAgent(), { fetch: fetchImpl });
    const tool = httpTool('get');

    await expect(adapters.http!(tool, { query: 'hello world', page: 2 }, context)).resolves.toEqual(
      { ok: true }
    );
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/search?query=hello+world&page=2', {
      method: 'GET',
    });
  });

  it('executes an HTTP POST with a JSON body and rejects non-success responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('created', {
          status: 201,
          headers: { 'content-type': 'text/plain' },
        })
      )
      .mockResolvedValueOnce(new Response('denied', { status: 403 }));
    const adapters = createRuntimeToolAdapters(createAgent(), { fetch: fetchImpl });
    const tool = httpTool('post');

    await expect(adapters.http!(tool, { value: 1 }, context)).resolves.toBe('created');
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
    });
    await expect(adapters.http!(tool, {}, context)).rejects.toMatchObject({
      code: 'HTTP_TOOL_REQUEST_FAILED',
    });
  });

  it('adds explicit local-function and remote-agent adapters without replacing built-ins', () => {
    const localFunction = vi.fn();
    const remoteAgent = vi.fn();
    const adapters = createRuntimeToolAdapters(createAgent(), {
      additionalAdapters: {
        'local-function': localFunction,
        'remote-agent': remoteAgent,
      },
    });

    expect(adapters['local-function']).toBe(localFunction);
    expect(adapters['remote-agent']).toBe(remoteAgent);
    expect(adapters['local-command']).toBeTypeOf('function');
    expect(adapters.http).toBeTypeOf('function');
  });
});

function httpTool(method: 'get' | 'post'): ToolDefinition {
  return {
    name: 'search',
    description: 'Search',
    parameters: { type: 'object' },
    endpointType: 'http',
    endpoint: { target: 'https://example.com/search', method },
  };
}

function createAgent(): IClientAgent {
  return {
    id: 'client',
    name: 'client',
    role: 'client',
    version: '1.0.0',
    capabilities: [],
    status: AgentStatus.READY,
    init: vi.fn(async () => undefined),
    execute: vi.fn(async () => success()),
    stream: async function* (): AsyncIterable<AgentStreamChunk> {},
    destroy: vi.fn(async () => undefined),
    on() {
      return this;
    },
    off() {
      return this;
    },
    startDaemon: vi.fn(async () => undefined),
    stopDaemon: vi.fn(async () => undefined),
    connectToHub: vi.fn(async () => undefined),
    disconnectFromHub: vi.fn(async () => undefined),
    getLocalCapabilityCache: vi.fn(() => []),
    setCapabilitySource: vi.fn(),
    executeLocalCapability: vi.fn(async () => success()),
    executeScopedTask: vi.fn(async () => success()),
    authorizeLocalCommand: vi.fn(async () => undefined),
    getLocalCommandAuthorization: vi.fn(() => 'readonly'),
  };
}

function success(): AgentResult {
  return {
    success: true,
    output: { content: 'ok' },
    meta: {
      duration: 0,
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'test',
    },
  };
}
