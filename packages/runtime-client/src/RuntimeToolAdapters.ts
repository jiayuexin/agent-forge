import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { CoreError, type ToolAdapter, type ToolAdapterMap } from '@agentforge/core';
import type { IClientAgent, ToolDefinition } from '@agentforge/types';

export interface CommandExecutionOptions {
  cwd?: string;
}

export type CommandExecutor = (
  command: string,
  options: CommandExecutionOptions
) => Promise<{ stdout: string; stderr: string }>;

export interface RuntimeToolAdapterOptions {
  commandExecutor?: CommandExecutor;
  fetch?: typeof fetch;
  additionalAdapters?: Pick<ToolAdapterMap, 'local-function' | 'remote-agent'>;
}

const executeCommand: CommandExecutor = promisify(exec);

export function createRuntimeToolAdapters(
  agent: IClientAgent,
  options: RuntimeToolAdapterOptions = {}
): ToolAdapterMap {
  const commandExecutor = options.commandExecutor ?? executeCommand;
  const fetchImpl = options.fetch ?? fetch;
  return {
    'local-command': async (tool, args) => {
      const target = requireEndpointTarget(tool, 'local-command');
      if (tool.endpoint?.method && tool.endpoint.method !== 'exec') {
        throw new CoreError(
          'INVALID_TOOL_ENDPOINT',
          `Local command tool "${tool.name}" must use method "exec"`
        );
      }
      const cwd = args.cwd;
      if (cwd !== undefined && typeof cwd !== 'string') {
        throw new CoreError(
          'INVALID_TOOL_ARGUMENT',
          `Local command tool "${tool.name}" requires cwd to be a string`
        );
      }
      await agent.authorizeLocalCommand(target);
      return commandExecutor(target, { cwd });
    },
    http: createHttpAdapter(fetchImpl),
    ...options.additionalAdapters,
  };
}

function createHttpAdapter(fetchImpl: typeof fetch): ToolAdapter {
  return async (tool, args) => {
    const target = requireEndpointTarget(tool, 'http');
    const method = tool.endpoint?.method ?? 'post';
    if (method === 'get') {
      const url = new URL(target);
      for (const [key, value] of Object.entries(args)) {
        url.searchParams.set(key, isScalar(value) ? String(value) : JSON.stringify(value));
      }
      return parseResponse(tool, await fetchImpl(url.toString(), { method: 'GET' }));
    }
    if (method === 'post') {
      return parseResponse(
        tool,
        await fetchImpl(target, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(args),
        })
      );
    }
    throw new CoreError(
      'INVALID_TOOL_ENDPOINT',
      `HTTP tool "${tool.name}" must use method "get" or "post"`
    );
  };
}

async function parseResponse(tool: ToolDefinition, response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new CoreError(
      'HTTP_TOOL_REQUEST_FAILED',
      `HTTP tool "${tool.name}" failed with status ${response.status}`
    );
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function requireEndpointTarget(
  tool: ToolDefinition,
  endpointType: NonNullable<ToolDefinition['endpointType']>
): string {
  if (tool.endpointType !== endpointType || !tool.endpoint?.target) {
    throw new CoreError(
      'INVALID_TOOL_ENDPOINT',
      `Tool "${tool.name}" requires a ${endpointType} endpoint`
    );
  }
  return tool.endpoint.target;
}

function isScalar(value: unknown): value is string | number | boolean | bigint | null | undefined {
  return (
    value === null ||
    value === undefined ||
    ['string', 'number', 'boolean', 'bigint'].includes(typeof value)
  );
}
