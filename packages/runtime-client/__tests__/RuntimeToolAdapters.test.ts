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
    expect(commandExecutor).toHaveBeenCalledWith(
      { executable: 'git', args: ['status', '--porcelain'] },
      { cwd: '/workspace' }
    );
  });

  it('reports success audit to Hub after local-command execution', async () => {
    const agent = createAgent();
    const auditReporter = vi.fn(async () => undefined);
    const commandExecutor = vi.fn(async () => ({ stdout: 'ok\n', stderr: '' }));
    const adapters = createRuntimeToolAdapters(agent, { commandExecutor, auditReporter });
    const tool = localCommandTool('echo hello');

    await expect(adapters['local-command']!(tool, {}, context)).resolves.toEqual({
      stdout: 'ok\n',
      stderr: '',
    });
    expect(auditReporter).toHaveBeenCalledWith({
      action: 'local-command',
      resource: 'echo hello',
      outcome: 'success',
      details: { tool: 'echo-cmd' },
    });
  });

  it('reports failure audit to Hub then rethrows when local-command execution fails', async () => {
    const agent = createAgent();
    const auditReporter = vi.fn(async () => undefined);
    const commandExecutor = vi.fn(async () => {
      throw new Error('exit 1');
    });
    const adapters = createRuntimeToolAdapters(agent, { commandExecutor, auditReporter });
    const tool = localCommandTool('false');

    await expect(adapters['local-command']!(tool, {}, context)).rejects.toThrow('exit 1');
    expect(auditReporter).toHaveBeenCalledWith({
      action: 'local-command',
      resource: 'false',
      outcome: 'failure',
      details: { tool: 'echo-cmd', error: 'exit 1' },
    });
  });

  it('reports denied audit to Hub then rethrows when authorization fails', async () => {
    const agent = createAgent();
    vi.mocked(agent.authorizeLocalCommand).mockRejectedValue(
      Object.assign(new Error('Command denied'), { code: 'COMMAND_DENIED' })
    );
    const auditReporter = vi.fn(async () => undefined);
    const commandExecutor = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const adapters = createRuntimeToolAdapters(agent, { commandExecutor, auditReporter });
    const tool = localCommandTool('rm -rf /');

    await expect(adapters['local-command']!(tool, {}, context)).rejects.toMatchObject({
      code: 'COMMAND_DENIED',
    });
    expect(commandExecutor).not.toHaveBeenCalled();
    expect(auditReporter).toHaveBeenCalledWith({
      action: 'local-command',
      resource: 'rm -rf /',
      outcome: 'denied',
      details: { tool: 'echo-cmd', error: 'Command denied' },
    });
  });

  it('surfaces Hub audit report failures without swallowing them', async () => {
    const agent = createAgent();
    const auditReporter = vi.fn(async () => {
      throw Object.assign(new Error('Hub unreachable'), { code: 'AUDIT_REPORT_FAILED' });
    });
    const commandExecutor = vi.fn(async () => ({ stdout: 'ok\n', stderr: '' }));
    const adapters = createRuntimeToolAdapters(agent, { commandExecutor, auditReporter });
    const tool = localCommandTool('echo hello');

    await expect(adapters['local-command']!(tool, {}, context)).rejects.toMatchObject({
      code: 'AUDIT_REPORT_FAILED',
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

  it('rejects local-command targets that contain shell metacharacters', async () => {
    const commandExecutor = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const adapters = createRuntimeToolAdapters(createAgent(), { commandExecutor });
    const tool = localCommandTool('echo hello; rm -rf /');

    await expect(adapters['local-command']!(tool, {}, context)).rejects.toMatchObject({
      code: 'INVALID_TOOL_ENDPOINT',
    });
    expect(commandExecutor).not.toHaveBeenCalled();
  });

  it('rejects cwd values that traverse parent directories', async () => {
    const commandExecutor = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const adapters = createRuntimeToolAdapters(createAgent(), { commandExecutor });
    const tool = localCommandTool('ls');

    await expect(
      adapters['local-command']!(tool, { cwd: '../etc' }, context)
    ).rejects.toMatchObject({
      code: 'INVALID_TOOL_ARGUMENT',
    });
    expect(commandExecutor).not.toHaveBeenCalled();
  });

  it('blocks HTTP tools that target private or metadata addresses', async () => {
    const fetchImpl = vi.fn();
    const adapters = createRuntimeToolAdapters(createAgent(), { fetch: fetchImpl });
    const tool: ToolDefinition = {
      name: 'metadata',
      description: 'SSRF probe',
      parameters: { type: 'object' },
      endpointType: 'http',
      endpoint: { target: 'http://169.254.169.254/latest/meta-data', method: 'get' },
    };

    await expect(adapters.http!(tool, {}, context)).rejects.toMatchObject({
      code: 'UNSAFE_HTTP_TARGET',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects oversized HTTP responses', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('x'.repeat(64), {
          headers: { 'content-type': 'text/plain' },
        })
    );
    const adapters = createRuntimeToolAdapters(createAgent(), {
      fetch: fetchImpl,
      maxHttpResponseBytes: 8,
    });
    const tool = httpTool('get');

    await expect(adapters.http!(tool, {}, context)).rejects.toMatchObject({
      code: 'HTTP_TOOL_RESPONSE_TOO_LARGE',
    });
  });
});

function localCommandTool(target: string): ToolDefinition {
  return {
    name: 'echo-cmd',
    description: 'Run a fixed local command',
    parameters: { type: 'object' },
    endpointType: 'local-command',
    endpoint: { target, method: 'exec' },
  };
}

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
