import { spawn } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import {
  CoreError,
  parseLocalCommand,
  formatLocalCommand,
  assertSafeHttpTarget,
  DEFAULT_MAX_HTTP_RESPONSE_BYTES,
  type ToolAdapter,
  type ToolAdapterMap,
} from '@agentforge/core';
import type { IClientAgent, ToolDefinition } from '@agentforge/types';
import type { AuditReporter } from './HubAuditReporter.js';

export interface CommandExecutionOptions {
  cwd?: string;
}

export interface CommandSpec {
  executable: string;
  args: string[];
}

export type CommandExecutor = (
  command: CommandSpec,
  options: CommandExecutionOptions
) => Promise<{ stdout: string; stderr: string }>;

export interface RuntimeToolAdapterOptions {
  commandExecutor?: CommandExecutor;
  fetch?: typeof fetch;
  auditReporter?: AuditReporter;
  additionalAdapters?: Pick<ToolAdapterMap, 'local-function' | 'remote-agent'>;
  maxHttpResponseBytes?: number;
}

export function spawnLocalCommand(
  command: CommandSpec,
  options: CommandExecutionOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };
      if (code === 0) {
        resolve(result);
        return;
      }
      reject(
        new CoreError(
          'LOCAL_COMMAND_FAILED',
          `Command exited with code ${code ?? 'unknown'}`,
          result
        )
      );
    });
  });
}

export function createRuntimeToolAdapters(
  agent: IClientAgent,
  options: RuntimeToolAdapterOptions = {}
): ToolAdapterMap {
  const commandExecutor = options.commandExecutor ?? spawnLocalCommand;
  const fetchImpl = options.fetch ?? fetch;
  const auditReporter = options.auditReporter;
  const maxHttpResponseBytes = options.maxHttpResponseBytes ?? DEFAULT_MAX_HTTP_RESPONSE_BYTES;
  return {
    'local-command': async (tool, args) => {
      const target = requireEndpointTarget(tool, 'local-command');
      if (tool.endpoint?.method && tool.endpoint.method !== 'exec') {
        throw new CoreError(
          'INVALID_TOOL_ENDPOINT',
          `Local command tool "${tool.name}" must use method "exec"`
        );
      }

      let spec: CommandSpec;
      try {
        spec = parseLocalCommand(target);
      } catch (error) {
        throw new CoreError(
          'INVALID_TOOL_ENDPOINT',
          error instanceof Error ? error.message : String(error)
        );
      }

      const cwd = resolveCommandCwd(args.cwd, tool.name);
      const display = formatLocalCommand(spec);

      try {
        await agent.authorizeLocalCommand(display);
      } catch (error) {
        await reportLocalCommandAudit(auditReporter, {
          resource: display,
          outcome: 'denied',
          details: { tool: tool.name, error: errorMessage(error) },
        });
        throw error;
      }

      try {
        const result = await commandExecutor(spec, { cwd });
        await reportLocalCommandAudit(auditReporter, {
          resource: display,
          outcome: 'success',
          details: { tool: tool.name, ...(cwd !== undefined ? { cwd } : {}) },
        });
        return result;
      } catch (error) {
        await reportLocalCommandAudit(auditReporter, {
          resource: display,
          outcome: 'failure',
          details: { tool: tool.name, error: errorMessage(error) },
        });
        throw error;
      }
    },
    http: createHttpAdapter(fetchImpl, maxHttpResponseBytes),
    ...options.additionalAdapters,
  };
}

function resolveCommandCwd(cwd: unknown, toolName: string): string | undefined {
  if (cwd === undefined) {
    return undefined;
  }
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.includes('\0') || cwd.includes('..')) {
    throw new CoreError(
      'INVALID_TOOL_ARGUMENT',
      `Local command tool "${toolName}" received an unsafe cwd`
    );
  }
  return resolvePath(cwd);
}

async function reportLocalCommandAudit(
  auditReporter: AuditReporter | undefined,
  event: {
    resource: string;
    outcome: 'success' | 'failure' | 'denied';
    details?: Record<string, unknown>;
  }
): Promise<void> {
  if (!auditReporter) {
    return;
  }
  await auditReporter({
    action: 'local-command',
    resource: event.resource,
    outcome: event.outcome,
    details: event.details,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createHttpAdapter(fetchImpl: typeof fetch, maxBytes: number): ToolAdapter {
  return async (tool, args) => {
    const target = requireEndpointTarget(tool, 'http');
    let url: URL;
    try {
      url = assertSafeHttpTarget(target);
    } catch (error) {
      throw new CoreError(
        'UNSAFE_HTTP_TARGET',
        error instanceof Error ? error.message : String(error)
      );
    }
    const method = tool.endpoint?.method ?? 'post';
    let response: Response;
    if (method === 'get') {
      for (const [key, value] of Object.entries(args)) {
        url.searchParams.set(key, isScalar(value) ? String(value) : JSON.stringify(value));
      }
      response = await fetchImpl(url.toString(), { method: 'GET' });
    } else if (method === 'post') {
      response = await fetchImpl(url.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
    } else {
      throw new CoreError(
        'INVALID_TOOL_ENDPOINT',
        `HTTP tool "${tool.name}" must use method "get" or "post"`
      );
    }
    return parseResponse(tool, response, maxBytes);
  };
}

async function parseResponse(
  tool: ToolDefinition,
  response: Response,
  maxBytes: number
): Promise<unknown> {
  if (!response.ok) {
    throw new CoreError(
      'HTTP_TOOL_REQUEST_FAILED',
      `HTTP tool "${tool.name}" failed with status ${response.status}`
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new CoreError(
      'HTTP_TOOL_RESPONSE_TOO_LARGE',
      `HTTP tool "${tool.name}" response exceeded ${maxBytes} bytes`
    );
  }
  const contentType = response.headers.get('content-type') ?? '';
  const text = buffer.toString('utf8');
  if (contentType.includes('application/json')) {
    return JSON.parse(text) as unknown;
  }
  return text;
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
