import type {
  IAgent,
  Logger,
  ToolCallRecord,
  ToolCallRequest,
  ToolContext,
  ToolDefinition,
} from '@agentforge/types';
import { CoreError } from '../errors.js';
import { assertJsonValue } from './JsonValue.js';
import type { ToolRegistry } from './ToolRegistry.js';

export type ToolEndpointType = NonNullable<ToolDefinition['endpointType']>;

export type ToolAdapter = (
  tool: ToolDefinition,
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<unknown>;

export type ToolAdapterMap = Partial<Record<ToolEndpointType, ToolAdapter>>;

export interface ToolRunnerOptions {
  registry: ToolRegistry;
  agent: IAgent;
  logger: Logger;
  adapters?: ToolAdapterMap;
}

export interface ToolExecutionRecord extends ToolCallRecord {
  errorCode?: string;
}

export class ToolRunner {
  private readonly context: ToolContext;
  private readonly adapters: ToolAdapterMap;

  constructor(private readonly options: ToolRunnerOptions) {
    this.context = { agent: options.agent, logger: options.logger };
    this.adapters = options.adapters ?? {};
  }

  async execute(call: ToolCallRequest): Promise<ToolExecutionRecord> {
    const startedAt = Date.now();
    const publicArgs = redactToolArgs(call.args);
    try {
      const result = await this.run(call);
      try {
        assertJsonValue(result);
      } catch {
        throw new CoreError(
          'TOOL_RESULT_SERIALIZATION_FAILED',
          `Result from tool "${call.name}" could not be serialized`
        );
      }
      return {
        name: call.name,
        args: publicArgs,
        result,
        duration: Date.now() - startedAt,
        status: 'success',
      };
    } catch (error) {
      this.options.logger.error('Tool execution failed', {
        toolName: call.name,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const errorCode = error instanceof CoreError ? error.code : 'TOOL_EXECUTION_FAILED';
      return {
        name: call.name,
        args: publicArgs,
        result: undefined,
        duration: Date.now() - startedAt,
        status: 'error',
        errorCode,
        error: publicErrorMessage(call.name, errorCode),
      };
    }
  }

  async executeOrThrow(call: ToolCallRequest): Promise<ToolExecutionRecord> {
    const record = await this.execute(call);
    if (record.status === 'error') {
      throw new CoreError(
        record.errorCode ?? 'TOOL_EXECUTION_FAILED',
        record.error ?? `Tool "${call.name}" execution failed`,
        { record }
      );
    }
    return record;
  }

  private async run(call: ToolCallRequest): Promise<unknown> {
    const tool = this.options.registry.resolve(call.name);
    if (tool.handler) {
      return tool.handler(call.args, this.context);
    }

    if (!tool.endpointType || !tool.endpoint?.target) {
      throw new CoreError(
        'INVALID_TOOL_DEFINITION',
        `Tool "${tool.name}" requires both endpointType and endpoint`
      );
    }

    const adapter = this.adapters[tool.endpointType];
    if (!adapter) {
      throw new CoreError(
        'TOOL_ADAPTER_NOT_FOUND',
        `No adapter registered for endpoint type "${tool.endpointType}"`
      );
    }

    return adapter(tool, call.args, this.context);
  }
}

export function redactToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  return redactValue(args, new WeakSet<object>()) as Record<string, unknown>;
}

function redactValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return '[Circular]';
    ancestors.add(value);
    const redacted = value.map((item) => redactValue(item, ancestors));
    ancestors.delete(value);
    return redacted;
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (ancestors.has(value)) return '[Circular]';

  ancestors.add(value);
  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key) ? '[REDACTED]' : redactValue(item, ancestors);
  }
  ancestors.delete(value);
  return redacted;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_\s]/g, '').toLowerCase();
  return (
    normalized === 'apikey' ||
    normalized === 'xapikey' ||
    normalized === 'authorization' ||
    normalized === 'auth' ||
    normalized === 'cookie' ||
    normalized === 'setcookie' ||
    normalized === 'sessionid' ||
    normalized === 'accesskey' ||
    normalized === 'credential' ||
    normalized === 'credentials' ||
    normalized === 'privatekey' ||
    normalized === 'passwd' ||
    normalized.endsWith('token') ||
    normalized.endsWith('password') ||
    normalized.endsWith('secret')
  );
}

function publicErrorMessage(toolName: string, errorCode: string): string {
  switch (errorCode) {
    case 'TOOL_NOT_FOUND':
      return `Tool "${toolName}" is not registered`;
    case 'INVALID_TOOL_DEFINITION':
      return `Tool "${toolName}" has an invalid execution definition`;
    case 'TOOL_ADAPTER_NOT_FOUND':
      return `No adapter is registered for tool "${toolName}"`;
    case 'TOOL_RESULT_SERIALIZATION_FAILED':
      return `Result from tool "${toolName}" could not be serialized`;
    default:
      return `Tool "${toolName}" execution failed`;
  }
}
