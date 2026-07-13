import type {
  AgentResult,
  AgentTask,
  IAgent,
  IProvider,
  Logger,
  Message,
  ToolCallRecord,
  ToolCallRequest,
  ToolDefinition,
} from '@agentforge/types';
import { CoreError } from '../errors.js';
import { ToolRegistry } from './ToolRegistry.js';
import {
  redactToolArgs,
  ToolRunner,
  type ToolAdapterMap,
  type ToolExecutionRecord,
} from './ToolRunner.js';
import { serializeJsonValue } from './JsonValue.js';

export type AgentExecutorToolEvent =
  | { type: 'call'; call: ToolCallRequest }
  | { type: 'result'; call: ToolCallRequest; record: ToolExecutionRecord };

export interface AgentExecutorOptions {
  provider: IProvider;
  tools: readonly ToolDefinition[];
  systemPrompt: string;
  agent: IAgent;
  logger: Logger;
  maxToolCalls?: number;
  toolAdapters?: ToolAdapterMap;
  onToolEvent?: (event: AgentExecutorToolEvent) => void | Promise<void>;
}

export class AgentExecutor {
  private readonly registry: ToolRegistry;
  private readonly runner: ToolRunner;
  private readonly maxToolCalls: number;

  constructor(private readonly options: AgentExecutorOptions) {
    const maxToolCalls = options.maxToolCalls ?? 20;
    if (!Number.isFinite(maxToolCalls) || !Number.isInteger(maxToolCalls) || maxToolCalls < 0) {
      throw new CoreError(
        'INVALID_MAX_TOOL_CALLS',
        'maxToolCalls must be a non-negative finite integer',
        { maxToolCalls }
      );
    }
    this.registry = new ToolRegistry(options.tools);
    this.runner = new ToolRunner({
      registry: this.registry,
      agent: options.agent,
      logger: options.logger,
      adapters: options.toolAdapters,
    });
    this.maxToolCalls = maxToolCalls;
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const messages: Message[] = [
      { role: 'system', content: this.options.systemPrompt },
      ...(task.context?.history ?? []),
      { role: 'user', content: this.taskToString(task) },
    ];

    const startedAt = Date.now();
    const toolsCalled: ToolCallRecord[] = [];
    const usage = { input: 0, output: 0, total: 0 };
    let model = this.options.provider.provider;
    let toolCallCount = 0;

    while (true) {
      const providerTools = this.registry.listProviderTools();
      const response = await this.options.provider.chat({
        messages,
        ...(providerTools.length > 0 ? { tools: providerTools } : {}),
        temperature: task.meta?.priority ? 0.5 : undefined,
        traceId: task.meta?.traceId,
      });
      usage.input += response.usage.input;
      usage.output += response.usage.output;
      usage.total += response.usage.total;
      model = response.model;

      const toolCalls = response.toolCalls ?? [];
      if (toolCalls.length === 0) {
        return {
          success: true,
          output: {
            content: response.content,
            structured: response.structured,
          },
          meta: {
            duration: Date.now() - startedAt,
            tokensUsed: usage,
            model,
            toolsCalled,
          },
        };
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls,
      });

      if (toolCallCount + toolCalls.length > this.maxToolCalls) {
        return this.failureResult({
          code: 'MAX_TOOL_CALLS_EXCEEDED',
          message: `Tool call limit of ${this.maxToolCalls} would be exceeded`,
          content: response.content,
          startedAt,
          usage,
          model,
          toolsCalled,
          details: {
            maxToolCalls: this.maxToolCalls,
            attemptedToolCalls: toolCallCount + toolCalls.length,
          },
        });
      }

      for (const call of toolCalls) {
        const publicCall: ToolCallRequest = {
          ...call,
          args: redactToolArgs(call.args),
        };
        await this.options.onToolEvent?.({ type: 'call', call: publicCall });
        const record = await this.runner.execute(call);
        toolCallCount += 1;

        if (record.status === 'error') {
          toolsCalled.push(record);
          await this.options.onToolEvent?.({
            type: 'result',
            call: publicCall,
            record,
          });
          return this.failureResult({
            code: record.errorCode ?? 'TOOL_EXECUTION_FAILED',
            message: record.error ?? `Tool "${call.name}" execution failed`,
            content: response.content,
            startedAt,
            usage,
            model,
            toolsCalled,
            details: { record },
          });
        }

        let serializedResult: string;
        try {
          serializedResult = this.serializeToolResult(call, record.result);
        } catch (error) {
          const serializationError =
            error instanceof CoreError
              ? error
              : new CoreError(
                  'TOOL_RESULT_SERIALIZATION_FAILED',
                  `Result from tool "${call.name}" could not be serialized`
                );
          const failedRecord: ToolExecutionRecord = {
            ...record,
            result: undefined,
            status: 'error',
            errorCode: serializationError.code,
            error: serializationError.message,
          };
          toolsCalled.push(failedRecord);
          await this.options.onToolEvent?.({
            type: 'result',
            call: publicCall,
            record: failedRecord,
          });
          return this.failureResult({
            code: serializationError.code,
            message: serializationError.message,
            content: response.content,
            startedAt,
            usage,
            model,
            toolsCalled,
            details: { record: failedRecord },
          });
        }

        toolsCalled.push(record);
        await this.options.onToolEvent?.({
          type: 'result',
          call: publicCall,
          record,
        });
        messages.push({
          role: 'tool',
          content: serializedResult,
          toolCallId: call.callId,
          toolName: call.name,
        });
      }
    }
  }

  private taskToString(task: AgentTask): string {
    return JSON.stringify(task.input);
  }

  private serializeToolResult(call: ToolCallRequest, result: unknown): string {
    try {
      return serializeJsonValue(result);
    } catch {
      throw new CoreError(
        'TOOL_RESULT_SERIALIZATION_FAILED',
        `Result from tool "${call.name}" could not be serialized`
      );
    }
  }

  private failureResult(options: {
    code: string;
    message: string;
    content: string;
    startedAt: number;
    usage: { input: number; output: number; total: number };
    model: string;
    toolsCalled: ToolCallRecord[];
    details?: unknown;
  }): AgentResult {
    return {
      success: false,
      output: { content: options.content },
      meta: {
        duration: Date.now() - options.startedAt,
        tokensUsed: options.usage,
        model: options.model,
        toolsCalled: options.toolsCalled,
      },
      error: {
        code: options.code,
        message: options.message,
        details: options.details,
      },
    };
  }
}
