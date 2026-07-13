import { randomUUID } from 'node:crypto';
import type {
  AgentCapability,
  AgentConfig,
  AgentEvent,
  AgentStatus,
  AgentStreamChunk,
  AgentTask,
  AgentResult,
  EventHandler,
  IAgent,
  IProvider,
  Logger,
  ToolDefinition,
} from '@agentforge/types';
import { AgentStatus as Status } from '@agentforge/types';
import { AgentLifeCycle } from './AgentLifeCycle.js';
import { MiddlewareChain } from '../runtime/MiddlewareChain.js';
import { AgentExecutor } from '../runtime/AgentExecutor.js';
import type { ToolAdapterMap } from '../runtime/ToolRunner.js';
import { ProviderFactory } from '../provider/ProviderFactory.js';
import { CoreError } from '../errors.js';
import { SimpleLogger } from '../logger/SimpleLogger.js';

export type ToolProvider = () => readonly ToolDefinition[];

export interface BaseAgentOptions {
  readonly toolProvider?: ToolProvider;
  readonly logger?: Logger;
  readonly maxToolCalls?: number;
  readonly toolAdapters?: ToolAdapterMap;
}

export interface AgentExecutorOverrides {
  readonly tools?: readonly ToolDefinition[];
  readonly systemPrompt?: string;
}

export abstract class BaseAgent<TConfig extends AgentConfig = AgentConfig>
  implements IAgent<TConfig>
{
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly version: string;
  readonly capabilities: AgentCapability[] = [];

  protected config?: TConfig;
  protected lifecycle = new AgentLifeCycle();
  protected middlewareChain = new MiddlewareChain();
  protected provider?: IProvider;
  protected readonly logger: Logger;
  private readonly runtimeOptions: BaseAgentOptions;
  private eventHandlers = new Map<AgentEvent, Set<EventHandler>>();

  constructor(config?: TConfig, options: BaseAgentOptions = {}) {
    this.config = config;
    this.runtimeOptions = options;
    const identity = config?.identity;
    this.id = identity?.id ?? randomUUID();
    this.name = identity?.name ?? 'agent';
    this.role = identity?.role ?? 'generic';
    this.version = identity?.version ?? '0.0.0';
    this.logger = options.logger ?? new SimpleLogger({ agentId: this.id });
    if (config?.capabilities) {
      this.capabilities.push(...config.capabilities);
    }
  }

  get status(): AgentStatus {
    return this.lifecycle.status;
  }

  async init(config?: TConfig): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config } as TConfig;
    }
    if (!this.config) {
      throw new CoreError('MISSING_CONFIG', 'Agent config is required');
    }

    this.lifecycle.transition(Status.INITIALIZING);
    await this.emit('agent:init', undefined);

    this.provider = ProviderFactory.create(this.config.model);

    await this.doInit?.();

    const isValid = await this.provider.validate();
    if (!isValid) {
      throw new CoreError('INVALID_PROVIDER', 'Provider validation failed');
    }

    this.lifecycle.transition(Status.READY);
    await this.emit('agent:ready', undefined);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this.lifecycle.assertStatus(Status.READY);
    this.lifecycle.transition(Status.RUNNING);

    try {
      await this.emit('agent:execute:start', task);
      const processedTask = await this.middlewareChain.runBefore(task);
      const result = await this.doExecute(processedTask);
      const processedResult = await this.middlewareChain.runAfter(result, processedTask);
      this.lifecycle.transition(Status.READY);
      await this.emit('agent:execute:end', processedResult);
      return processedResult;
    } catch (error) {
      this.lifecycle.transition(Status.ERROR);
      await this.emit('agent:error', error);
      try {
        const recovered = await this.middlewareChain.runOnError(error as Error, task);
        this.lifecycle.transition(Status.READY);
        return recovered;
      } catch {
        throw error;
      }
    }
  }

  async *stream(task: AgentTask): AsyncIterable<AgentStreamChunk> {
    if (this.doStream) {
      yield* this.doStream(task);
      return;
    }

    const result = await this.execute(task);
    yield {
      type: 'text',
      content: result.output.content,
      index: 0,
    };
    yield { type: 'done', index: 1 };
  }

  async destroy(): Promise<void> {
    this.lifecycle.transition(Status.DESTROYED);
    await this.emit('agent:destroy', undefined);
  }

  on(event: AgentEvent, handler: EventHandler): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  off(event: AgentEvent, handler: EventHandler): this {
    this.eventHandlers.get(event)?.delete(handler);
    return this;
  }

  protected async emit(event: AgentEvent, payload: unknown): Promise<void> {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      await handler(payload);
    }
  }

  protected getAvailableTools(): readonly ToolDefinition[] {
    return [...(this.config?.tools ?? []), ...(this.runtimeOptions.toolProvider?.() ?? [])];
  }

  protected createExecutor(overrides: AgentExecutorOverrides = {}): AgentExecutor {
    if (!this.provider) {
      throw new CoreError('NOT_INITIALIZED', 'Provider not initialized');
    }
    if (!this.config) {
      throw new CoreError('MISSING_CONFIG', 'Agent config is required');
    }

    return new AgentExecutor({
      provider: this.provider,
      tools: overrides.tools ?? this.getAvailableTools(),
      systemPrompt: overrides.systemPrompt ?? this.config.systemPrompt,
      agent: this,
      logger: this.logger,
      maxToolCalls: this.runtimeOptions.maxToolCalls,
      toolAdapters: this.runtimeOptions.toolAdapters,
      onToolEvent: async (event) => {
        if (event.type === 'call') {
          await this.emit('agent:tool:call', event.call);
          return;
        }
        await this.emit('agent:tool:result', event.record);
      },
    });
  }

  protected abstract doExecute(task: AgentTask): Promise<AgentResult>;
  protected doStream?(task: AgentTask): AsyncIterable<AgentStreamChunk>;
  protected async doInit?(): Promise<void>;
}
