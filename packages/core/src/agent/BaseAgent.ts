import type {
  IAgent,
  AgentConfig,
  AgentTask,
  AgentResult,
  AgentStreamChunk,
  AgentEvent,
  EventHandler,
  IPlugin,
  AgentCapability,
  Middleware,
  ToolDefinition,
  PluginContext,
  Logger,
} from '@agentforge/types';
import { AgentStatus } from '@agentforge/types';
import { AgentLifeCycle, AgentStatusError } from './AgentLifeCycle';

/** Minimal console-based logger used when no external logger is provided */
const defaultLogger: Logger = {
  debug(message: string, ...args: unknown[]) {
    console.debug(`[agentforge] ${message}`, ...args);
  },
  info(message: string, ...args: unknown[]) {
    console.info(`[agentforge] ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(`[agentforge] ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]) {
    console.error(`[agentforge] ${message}`, ...args);
  },
  child(context: Record<string, unknown>): Logger {
    const prefix = Object.entries(context)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    return {
      debug: (msg, ...args) => defaultLogger.debug(`[${prefix}] ${msg}`, ...args),
      info: (msg, ...args) => defaultLogger.info(`[${prefix}] ${msg}`, ...args),
      warn: (msg, ...args) => defaultLogger.warn(`[${prefix}] ${msg}`, ...args),
      error: (msg, ...args) => defaultLogger.error(`[${prefix}] ${msg}`, ...args),
      child: (ctx) => defaultLogger.child({ ...context, ...ctx }),
    };
  },
};

export abstract class BaseAgent<TConfig extends AgentConfig = AgentConfig> implements IAgent<TConfig> {
  private _id: string;
  private _name: string;
  private _role: string;
  private _version: string;
  private readonly _lifecycle = new AgentLifeCycle();
  private readonly _plugins: IPlugin[] = [];
  private readonly _eventHandlers = new Map<string, Set<EventHandler>>();
  private readonly _middlewares: Middleware[] = [];
  private readonly _capabilities: AgentCapability[] = [];
  private _config: TConfig | null = null;

  // --- IAgent getters ---

  get id(): string {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get role(): string {
    return this._role;
  }

  get version(): string {
    return this._version;
  }

  get capabilities(): AgentCapability[] {
    return [...this._capabilities];
  }

  get status(): AgentStatus {
    return this._lifecycle.status;
  }

  // --- IAgent methods ---

  async init(config: TConfig): Promise<void> {
    this._lifecycle.transition(AgentStatus.INITIALIZING);
    try {
      this._config = config;
      await this.doInit(config);
      this._lifecycle.transition(AgentStatus.READY);
      this.emit('agent:init', { agentId: this._id });
    } catch (err) {
      this._lifecycle.transition(AgentStatus.ERROR);
      throw err;
    }
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this._lifecycle.assertStatus(AgentStatus.READY, AgentStatus.RUNNING);
    this._lifecycle.transition(AgentStatus.RUNNING);
    this.emit('agent:execute:start', { agentId: this._id, task });

    try {
      // Run before middlewares
      let processedTask = task;
      for (const mw of this._middlewares) {
        if (mw.before) {
          processedTask = await mw.before(processedTask);
        }
      }

      let result = await this.doExecute(processedTask);

      // Run after middlewares
      for (const mw of this._middlewares) {
        if (mw.after) {
          result = await mw.after(result, processedTask);
        }
      }

      this._lifecycle.transition(AgentStatus.READY);
      this.emit('agent:execute:end', { agentId: this._id, result });
      return result;
    } catch (err) {
      // Run error middlewares
      for (const mw of this._middlewares) {
        if (mw.onError && err instanceof Error) {
          try {
            const recovered = await mw.onError(err as Error, task);
            this._lifecycle.transition(AgentStatus.READY);
            this.emit('agent:execute:end', { agentId: this._id, result: recovered });
            return recovered;
          } catch {
            // error middleware failed, continue with original error
          }
        }
      }

      this._lifecycle.transition(AgentStatus.ERROR);
      this.emit('agent:error', { agentId: this._id, error: err });
      throw err;
    }
  }

  async *stream(task: AgentTask): AsyncIterable<AgentStreamChunk> {
    if (this.doStream) {
      this._lifecycle.assertStatus(AgentStatus.READY, AgentStatus.RUNNING);
      this._lifecycle.transition(AgentStatus.RUNNING);
      this.emit('agent:execute:start', { agentId: this._id, task });

      try {
        let index = 0;
        for await (const chunk of this.doStream(task)) {
          yield { ...chunk, index: chunk.index ?? index++ };
        }
        this._lifecycle.transition(AgentStatus.READY);
        this.emit('agent:execute:end', { agentId: this._id });
      } catch (err) {
        this._lifecycle.transition(AgentStatus.ERROR);
        this.emit('agent:error', { agentId: this._id, error: err });
        throw err;
      }
    } else {
      // Fallback: wrap doExecute() into a single-chunk stream
      this._lifecycle.assertStatus(AgentStatus.READY, AgentStatus.RUNNING);
      this._lifecycle.transition(AgentStatus.RUNNING);
      this.emit('agent:execute:start', { agentId: this._id, task });

      try {
        // Run before middlewares
        let processedTask = task;
        for (const mw of this._middlewares) {
          if (mw.before) {
            processedTask = await mw.before(processedTask);
          }
        }

        let result = await this.doExecute(processedTask);

        // Run after middlewares
        for (const mw of this._middlewares) {
          if (mw.after) {
            result = await mw.after(result, processedTask);
          }
        }

        yield {
          type: 'text',
          content: result.output.content,
          index: 0,
          tokensUsed: result.meta.tokensUsed,
        };
        yield {
          type: 'done',
          index: 1,
        };
        this._lifecycle.transition(AgentStatus.READY);
        this.emit('agent:execute:end', { agentId: this._id, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield {
          type: 'error',
          error: { code: 'STREAM_ERROR', message },
          index: 0,
        };
        this._lifecycle.transition(AgentStatus.ERROR);
        this.emit('agent:error', { agentId: this._id, error: err });
        throw err;
      }
    }
  }

  async destroy(): Promise<void> {
    this.emit('agent:destroy', { agentId: this._id });

    // Uninstall plugins in reverse order
    for (let i = this._plugins.length - 1; i >= 0; i--) {
      const plugin = this._plugins[i];
      if (plugin.uninstall) {
        try {
          plugin.uninstall(this);
        } catch {
          // ignore uninstall errors during destroy
        }
      }
    }

    this._plugins.length = 0;
    this._middlewares.length = 0;
    this._eventHandlers.clear();
    this._lifecycle.transition(AgentStatus.DESTROYED);
  }

  use(plugin: IPlugin): this {
    const pluginContext: PluginContext = {
      registerTool: (tool: ToolDefinition) => {
        if (this._config && this._config.tools) {
          this._config.tools.push(tool);
        }
      },
      registerMiddleware: (middleware: Middleware) => {
        this._middlewares.push(middleware);
      },
      config: this._config ?? ({} as AgentConfig),
      logger: defaultLogger.child({ agent: this._name, plugin: plugin.name }),
    };

    plugin.install(this, pluginContext);
    this._plugins.push(plugin);
    return this;
  }

  on(event: AgentEvent, handler: EventHandler): this {
    let handlers = this._eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this._eventHandlers.set(event, handlers);
    }
    handlers.add(handler);
    return this;
  }

  off(event: AgentEvent, handler: EventHandler): this {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._eventHandlers.delete(event);
      }
    }
    return this;
  }

  // --- Abstract / overridable methods for subclasses ---

  protected abstract doInit(config: TConfig): Promise<void>;
  protected abstract doExecute(task: AgentTask): Promise<AgentResult>;
  protected doStream?(task: AgentTask): AsyncIterable<AgentStreamChunk>;

  // --- Protected helpers ---

  protected emit(event: AgentEvent, payload?: unknown): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch {
          // event handlers must not break the agent
        }
      }
    }
  }

  protected get config(): TConfig | null {
    return this._config;
  }

  protected get middlewares(): readonly Middleware[] {
    return this._middlewares;
  }

  protected addCapability(capability: AgentCapability): void {
    this._capabilities.push(capability);
  }

  // --- Constructor ---

  constructor(options: { name: string; role: string; version?: string }) {
    this._id = `agent-${options.name}-${Date.now()}`;
    this._name = options.name;
    this._role = options.role;
    this._version = options.version ?? '1.0.0';
  }
}

export { AgentStatusError } from './AgentLifeCycle';
