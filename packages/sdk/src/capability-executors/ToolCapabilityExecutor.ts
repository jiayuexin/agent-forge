import { ToolRegistry, ToolRunner } from '@agentforge/core';
import type { ToolAdapterMap } from '@agentforge/core';
import { AgentStatus } from '@agentforge/types';
import type {
  AgentResult,
  AgentStreamChunk,
  AgentTask,
  IAgent,
  Logger,
  ToolCapability,
  ToolDefinition,
} from '@agentforge/types';
import { SDKError } from '../errors.js';
import type { CapabilityExecutor } from './types.js';

export type ToolEndpointAdapters = ToolAdapterMap;

export interface ToolCapabilityExecutorOptions {
  getAdapters: () => ToolEndpointAdapters;
  logger: Logger;
}

export function toolCapabilityToDefinition(capability: ToolCapability): ToolDefinition {
  return {
    name: capability.name,
    description: capability.description,
    parameters: capability.inputSchema,
    endpointType: capability.endpointType,
    endpoint: capability.endpoint,
  };
}

export class ToolCapabilityExecutor implements CapabilityExecutor<'tool'> {
  readonly type = 'tool' as const;
  private readonly hostAgent: IAgent = new CapabilityToolHostAgent();

  constructor(private readonly options: ToolCapabilityExecutorOptions) {}

  canExecute(capability: ToolCapability): boolean {
    return this.options.getAdapters()[capability.endpointType] !== undefined;
  }

  async execute(capability: ToolCapability, task: AgentTask): Promise<AgentResult> {
    const startedAt = Date.now();
    const definition = toolCapabilityToDefinition(capability);
    const runner = new ToolRunner({
      registry: new ToolRegistry([definition]),
      agent: this.hostAgent,
      logger: this.options.logger,
      adapters: this.options.getAdapters(),
    });
    const record = await runner.execute({
      name: definition.name,
      args: task.input,
      callId: `${capability.id}:direct`,
    });

    if (record.status === 'error') {
      return {
        success: false,
        output: { content: '' },
        meta: {
          duration: Date.now() - startedAt,
          tokensUsed: { input: 0, output: 0, total: 0 },
          model: 'tool',
          toolsCalled: [record],
        },
        error: {
          code: record.errorCode ?? 'TOOL_EXECUTION_FAILED',
          message: record.error ?? `Tool "${capability.name}" execution failed`,
          details: { record },
        },
      };
    }

    return {
      success: true,
      output: {
        content: formatToolResult(record.result),
        structured: { result: record.result },
      },
      meta: {
        duration: Date.now() - startedAt,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'tool',
        toolsCalled: [record],
      },
    };
  }
}

function formatToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === undefined) return '';
  return JSON.stringify(result);
}

class CapabilityToolHostAgent implements IAgent {
  readonly id = 'capability-tool-host';
  readonly name = 'capability-tool-host';
  readonly role = 'capability-tool-host';
  readonly version = '1.0.0';
  readonly capabilities = [];
  readonly status = AgentStatus.READY;

  async init(): Promise<void> {}

  async execute(): Promise<AgentResult> {
    throw new SDKError(
      'CAPABILITY_TOOL_HOST_OPERATION_UNSUPPORTED',
      'The capability tool host cannot execute agent tasks'
    );
  }

  async *stream(): AsyncIterable<AgentStreamChunk> {
    throw new SDKError(
      'CAPABILITY_TOOL_HOST_OPERATION_UNSUPPORTED',
      'The capability tool host cannot stream agent tasks'
    );
  }

  async destroy(): Promise<void> {}

  on(): this {
    return this;
  }

  off(): this {
    return this;
  }
}
