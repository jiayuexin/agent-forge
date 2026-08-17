import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IAgent,
  Logger,
  ToolCallRequest,
  ToolContext,
  ToolDefinition,
} from '@agentforge/types';
import { ToolRegistry } from '../ToolRegistry.js';
import { ToolRunner, type ToolAdapterMap } from '../ToolRunner.js';

const agent = { id: 'agent-1' } as IAgent;
const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
} as unknown as Logger;
const context: ToolContext = { agent, logger };
const call: ToolCallRequest = {
  callId: 'call-1',
  name: 'get-weather',
  args: { city: 'Beijing' },
};

describe('ToolRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a handler and injects the agent and logger context', async () => {
    const handler = vi.fn().mockResolvedValue({ temperature: 20 });
    const runner = createRunner([
      {
        name: 'get-weather',
        description: 'Get weather',
        parameters: { type: 'object' },
        handler,
      },
    ]);

    const record = await runner.execute(call);

    expect(handler).toHaveBeenCalledWith(call.args, context);
    expect(record).toEqual({
      name: 'get-weather',
      args: { city: 'Beijing' },
      result: { temperature: 20 },
      duration: expect.any(Number),
      status: 'success',
    });
  });

  it('redacts sensitive args in a successful record without changing handler input', async () => {
    const sensitiveCall: ToolCallRequest = {
      callId: 'call-sensitive',
      name: 'get-weather',
      args: {
        apiKey: 'api-key-value',
        query: 'Beijing',
      },
    };
    const handler = vi.fn().mockResolvedValue('sunny');
    const runner = createRunner([
      {
        name: 'get-weather',
        description: 'Get weather',
        parameters: { type: 'object' },
        handler,
      },
    ]);

    const record = await runner.execute(sensitiveCall);

    expect(handler).toHaveBeenCalledWith(sensitiveCall.args, context);
    expect(record).toMatchObject({
      status: 'success',
      args: {
        apiKey: '[REDACTED]',
        query: 'Beijing',
      },
    });
  });

  it('redacts nested header, cookie, session, and access key variants', async () => {
    const sensitiveCall: ToolCallRequest = {
      callId: 'call-sensitive-variants',
      name: 'get-weather',
      args: {
        headers: {
          'X-API-Key': 'x-api-key-value',
          Cookie: 'cookie-value',
          'set-cookie': 'set-cookie-value',
          AUTHORIZATION: 'authorization-value',
        },
        sessions: [
          {
            sessionId: 'session-id-value',
            session_id: 'session-underscore-value',
          },
        ],
        keyValues: {
          accessKey: 'access-key-value',
          access_key: 'access-underscore-value',
          ToKeN: 'token-value',
          pass_word: 'password-value',
          client_secret: 'secret-value',
        },
        safe: 'visible',
      },
    };
    const handler = vi.fn().mockResolvedValue('sunny');
    const runner = createRunner([
      {
        name: 'get-weather',
        description: 'Get weather',
        parameters: { type: 'object' },
        handler,
      },
    ]);

    const record = await runner.execute(sensitiveCall);

    expect(handler).toHaveBeenCalledWith(sensitiveCall.args, context);
    expect(record.args).toEqual({
      headers: {
        'X-API-Key': '[REDACTED]',
        Cookie: '[REDACTED]',
        'set-cookie': '[REDACTED]',
        AUTHORIZATION: '[REDACTED]',
      },
      sessions: [
        {
          sessionId: '[REDACTED]',
          session_id: '[REDACTED]',
        },
      ],
      keyValues: {
        accessKey: '[REDACTED]',
        access_key: '[REDACTED]',
        ToKeN: '[REDACTED]',
        pass_word: '[REDACTED]',
        client_secret: '[REDACTED]',
      },
      safe: 'visible',
    });
  });

  it('returns an error record when a handler fails without retrying', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('weather service failed'));
    const runner = createRunner([
      {
        name: 'get-weather',
        description: 'Get weather',
        parameters: { type: 'object' },
        handler,
      },
    ]);

    const record = await runner.execute(call);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(record).toMatchObject({
      name: 'get-weather',
      args: { city: 'Beijing' },
      result: undefined,
      status: 'error',
      error: 'Tool "get-weather" execution failed',
    });
  });

  it('logs the original error internally and recursively redacts public args', async () => {
    const failure = new Error('authorization header leaked');
    const sensitiveCall: ToolCallRequest = {
      callId: 'call-sensitive',
      name: 'get-weather',
      args: {
        token: 'token-value',
        nested: {
          API_KEY: 'api-key-value',
          Password: 'password-value',
          safe: 'visible',
        },
        items: [{ authorization: 'Bearer secret-value' }],
      },
    };
    const handler = vi.fn().mockRejectedValue(failure);
    const runner = createRunner([
      {
        name: 'get-weather',
        description: 'Get weather',
        parameters: { type: 'object' },
        handler,
      },
    ]);

    const record = await runner.execute(sensitiveCall);

    expect(handler).toHaveBeenCalledWith(sensitiveCall.args, context);
    expect(logger.error).toHaveBeenCalledWith('Tool execution failed', {
      toolName: 'get-weather',
      error: failure,
      errorMessage: 'authorization header leaked',
    });
    expect(record).toMatchObject({
      status: 'error',
      errorCode: 'TOOL_EXECUTION_FAILED',
      error: 'Tool "get-weather" execution failed',
      args: {
        token: '[REDACTED]',
        nested: {
          API_KEY: '[REDACTED]',
          Password: '[REDACTED]',
          safe: 'visible',
        },
        items: [{ authorization: '[REDACTED]' }],
      },
    });
    const publicRecord = JSON.stringify(record);
    expect(publicRecord).not.toContain('token-value');
    expect(publicRecord).not.toContain('api-key-value');
    expect(publicRecord).not.toContain('password-value');
    expect(publicRecord).not.toContain('secret-value');
    expect(publicRecord).not.toContain(failure.message);
  });

  it('selects the local-command adapter and passes the endpoint definition', async () => {
    const localCommand = vi.fn().mockResolvedValue('command-result');
    const localFunction = vi.fn();
    const http = vi.fn();
    const remoteAgent = vi.fn();
    const tool: ToolDefinition = {
      name: 'get-weather',
      description: 'Get weather',
      parameters: { type: 'object' },
      endpointType: 'local-command',
      endpoint: { target: 'weather --city {{city}}', method: 'exec' },
    };
    const runner = createRunner([tool], {
      'local-command': localCommand,
      'local-function': localFunction,
      http,
      'remote-agent': remoteAgent,
    });

    const record = await runner.execute(call);

    expect(localCommand).toHaveBeenCalledWith(tool, call.args, context);
    expect(localFunction).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
    expect(remoteAgent).not.toHaveBeenCalled();
    expect(record).toMatchObject({ result: 'command-result', status: 'success' });
  });

  it('selects the local-function adapter and passes the endpoint definition', async () => {
    const localCommand = vi.fn();
    const localFunction = vi.fn().mockResolvedValue('function-result');
    const http = vi.fn();
    const remoteAgent = vi.fn();
    const tool: ToolDefinition = {
      name: 'get-weather',
      description: 'Get weather',
      parameters: { type: 'object' },
      endpointType: 'local-function',
      endpoint: { target: 'weather.lookup', method: 'call' },
    };
    const runner = createRunner([tool], {
      'local-command': localCommand,
      'local-function': localFunction,
      http,
      'remote-agent': remoteAgent,
    });

    const record = await runner.execute(call);

    expect(localFunction).toHaveBeenCalledWith(tool, call.args, context);
    expect(localCommand).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
    expect(remoteAgent).not.toHaveBeenCalled();
    expect(record).toMatchObject({ result: 'function-result', status: 'success' });
  });

  it('selects the http adapter and passes the endpoint definition', async () => {
    const localCommand = vi.fn();
    const localFunction = vi.fn();
    const http = vi.fn().mockResolvedValue({ temperature: 21 });
    const remoteAgent = vi.fn();
    const tool: ToolDefinition = {
      name: 'get-weather',
      description: 'Get weather',
      parameters: { type: 'object' },
      endpointType: 'http',
      endpoint: { target: '/weather', method: 'get' },
    };
    const runner = createRunner([tool], {
      'local-command': localCommand,
      'local-function': localFunction,
      http,
      'remote-agent': remoteAgent,
    });

    const record = await runner.execute(call);

    expect(http).toHaveBeenCalledWith(tool, call.args, context);
    expect(localCommand).not.toHaveBeenCalled();
    expect(localFunction).not.toHaveBeenCalled();
    expect(remoteAgent).not.toHaveBeenCalled();
    expect(record).toMatchObject({
      result: { temperature: 21 },
      status: 'success',
    });
  });

  it('selects the remote-agent adapter and passes the endpoint definition', async () => {
    const localCommand = vi.fn();
    const localFunction = vi.fn();
    const http = vi.fn();
    const remoteAgent = vi.fn().mockResolvedValue('remote-result');
    const tool: ToolDefinition = {
      name: 'get-weather',
      description: 'Get weather',
      parameters: { type: 'object' },
      endpointType: 'remote-agent',
      endpoint: { target: 'weather-agent', method: 'call' },
    };
    const runner = createRunner([tool], {
      'local-command': localCommand,
      'local-function': localFunction,
      http,
      'remote-agent': remoteAgent,
    });

    const record = await runner.execute(call);

    expect(remoteAgent).toHaveBeenCalledWith(tool, call.args, context);
    expect(localCommand).not.toHaveBeenCalled();
    expect(localFunction).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
    expect(record).toMatchObject({ result: 'remote-result', status: 'success' });
  });

  it('prefers a handler over an endpoint adapter', async () => {
    const handler = vi.fn().mockResolvedValue('handler-result');
    const adapter = vi.fn().mockResolvedValue('adapter-result');
    const runner = createRunner(
      [
        {
          name: 'get-weather',
          description: 'Get weather',
          parameters: { type: 'object' },
          handler,
          endpointType: 'http',
          endpoint: { target: '/weather' },
        },
      ],
      { http: adapter }
    );

    const record = await runner.execute(call);

    expect(record.result).toBe('handler-result');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('returns an error record when the endpoint adapter is missing', async () => {
    const runner = createRunner([
      {
        name: 'get-weather',
        description: 'Get weather',
        parameters: { type: 'object' },
        endpointType: 'http',
        endpoint: { target: '/weather' },
      },
    ]);

    await expect(runner.execute(call)).resolves.toMatchObject({
      status: 'error',
      errorCode: 'TOOL_ADAPTER_NOT_FOUND',
      error: 'No adapter is registered for tool "get-weather"',
    });
  });

  it('returns an error record for an incomplete endpoint definition', async () => {
    const runner = createRunner([
      {
        name: 'get-weather',
        description: 'Get weather',
        parameters: { type: 'object' },
        endpointType: 'http',
      },
    ]);

    await expect(runner.execute(call)).resolves.toMatchObject({
      status: 'error',
      errorCode: 'INVALID_TOOL_DEFINITION',
      error: 'Tool "get-weather" has an invalid execution definition',
    });
  });

  it('returns an error record when a tool result is outside the JSON data model', async () => {
    const runner = createRunner([
      {
        name: 'get-weather',
        description: 'Get weather',
        parameters: { type: 'object' },
        handler: async () => ({ temperature: Number.NaN }),
      },
    ]);

    await expect(runner.execute(call)).resolves.toMatchObject({
      status: 'error',
      errorCode: 'TOOL_RESULT_SERIALIZATION_FAILED',
      error: 'Result from tool "get-weather" could not be serialized',
    });
  });

  it('returns an error record for an unknown tool', async () => {
    const runner = createRunner([]);

    await expect(runner.execute(call)).resolves.toMatchObject({
      status: 'error',
      errorCode: 'TOOL_NOT_FOUND',
      error: 'Tool "get-weather" is not registered',
    });
  });

  it('executeOrThrow raises a CoreError containing the failure record', async () => {
    const runner = createRunner([]);

    await expect(runner.executeOrThrow(call)).rejects.toMatchObject({
      code: 'TOOL_NOT_FOUND',
      message: 'Tool "get-weather" is not registered',
      details: {
        record: expect.objectContaining({
          name: 'get-weather',
          status: 'error',
        }),
      },
    });
  });
});

function createRunner(tools: ToolDefinition[], adapters: ToolAdapterMap = {}): ToolRunner {
  return new ToolRunner({
    registry: new ToolRegistry(tools),
    agent,
    logger,
    adapters,
  });
}
