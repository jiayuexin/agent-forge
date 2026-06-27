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
  IPlugin,
  IProvider,
} from '@agentforge/types';
import { AgentStatus as Status } from '@agentforge/types';
import { AgentLifeCycle } from './AgentLifeCycle.js';
import { MiddlewareChain } from '../runtime/MiddlewareChain.js';
import { PluginManager } from '../plugin/PluginManager.js';
import { ProviderFactory } from '../provider/ProviderFactory.js';
import { SimpleLogger } from '../logger/SimpleLogger.js';
import { CoreError } from '../errors.js';

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
  protected pluginManager?: PluginManager;
  protected provider?: IProvider;
  private eventHandlers = new Map<AgentEvent, Set<EventHandler>>();

  constructor(config?: TConfig) {
    this.config = config;
    const identity = config?.identity;
    this.id = identity?.id ?? randomUUID();
    this.name = identity?.name ?? 'agent';
    this.role = identity?.role ?? 'generic';
    this.version = identity?.version ?? '0.0.0';
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
    this.emit('agent:init', undefined);

    this.provider = ProviderFactory.create(this.config.model);
    this.pluginManager = new PluginManager(this, this.config, new SimpleLogger({ agentId: this.id }));

    await this.doInit?.();

    const isValid = await this.provider.validate();
    if (!isValid) {
      throw new CoreError('INVALID_PROVIDER', 'Provider validation failed');
    }

    this.lifecycle.transition(Status.READY);
    this.emit('agent:ready', undefined);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this.lifecycle.assertStatus(Status.READY);
    this.lifecycle.transition(Status.RUNNING);
    this.emit('agent:execute:start', task);

    try {
      const processedTask = await this.middlewareChain.runBefore(task);
      const result = await this.doExecute(processedTask);
      const processedResult = await this.middlewareChain.runAfter(result, processedTask);
      this.lifecycle.transition(Status.READY);
      this.emit('agent:execute:end', processedResult);
      return processedResult;
    } catch (error) {
      this.lifecycle.transition(Status.ERROR);
      this.emit('agent:error', error);
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
    this.emit('agent:destroy', undefined);
  }

  use(plugin: IPlugin): this {
    this.pluginManager?.register(plugin);
    return this;
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

  protected emit(event: AgentEvent, payload: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch {
        // Event handler errors should not break the agent.
      }
    }
  }

  protected abstract doExecute(task: AgentTask): Promise<AgentResult>;
  protected doStream?(task: AgentTask): AsyncIterable<AgentStreamChunk>;
  protected async doInit?(): Promise<void>;
}
