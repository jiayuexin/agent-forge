import type { IAgent, IPlugin, PluginContext, ToolDefinition, Middleware, AgentConfig, Logger } from '@agentforge/types';
import { DefaultPluginContext } from './PluginContext';

/** Minimal console-based logger for PluginManager */
const defaultLogger: Logger = {
  debug(message: string, ...args: unknown[]) {
    console.debug(`[agentforge:plugin] ${message}`, ...args);
  },
  info(message: string, ...args: unknown[]) {
    console.info(`[agentforge:plugin] ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(`[agentforge:plugin] ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]) {
    console.error(`[agentforge:plugin] ${message}`, ...args);
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

/**
 * Manages plugin lifecycle: install, uninstall, and aggregation of tools/middlewares.
 */
export class PluginManager {
  private readonly _plugins: IPlugin[] = [];
  private readonly _tools: ToolDefinition[] = [];
  private readonly _middlewares: Middleware[] = [];

  get plugins(): ReadonlyArray<IPlugin> {
    return this._plugins;
  }

  get tools(): ReadonlyArray<ToolDefinition> {
    return this._tools;
  }

  get middlewares(): ReadonlyArray<Middleware> {
    return this._middlewares;
  }

  /**
   * Install a plugin. Creates a PluginContext scoped to the plugin,
   * calls plugin.install(), then aggregates any registered tools/middlewares.
   */
  install(plugin: IPlugin, agent: IAgent, config: AgentConfig, logger?: Logger): void {
    const ctx: PluginContext = new DefaultPluginContext(
      config,
      (logger ?? defaultLogger).child({ plugin: plugin.name }),
    );

    plugin.install(agent, ctx);

    this._plugins.push(plugin);

    // Aggregate tools and middlewares registered via the context
    if (ctx instanceof DefaultPluginContext) {
      for (const tool of ctx.tools) {
        this._tools.push(tool);
      }
      for (const mw of ctx.middlewares) {
        this._middlewares.push(mw);
      }
    }
  }

  /**
   * Uninstall a plugin. Calls plugin.uninstall() if defined, then removes
   * it from the managed list.
   */
  uninstall(plugin: IPlugin, agent: IAgent): void {
    const idx = this._plugins.indexOf(plugin);
    if (idx >= 0) {
      if (plugin.uninstall) {
        plugin.uninstall(agent);
      }
      this._plugins.splice(idx, 1);
    }
  }

  /** Register a tool directly (outside of a plugin). */
  addTool(tool: ToolDefinition): void {
    this._tools.push(tool);
  }

  /** Register a middleware directly (outside of a plugin). */
  addMiddleware(middleware: Middleware): void {
    this._middlewares.push(middleware);
  }

  /** Remove all plugins, tools, and middlewares. */
  clear(): void {
    for (let i = this._plugins.length - 1; i >= 0; i--) {
      const plugin = this._plugins[i];
      // We cannot call uninstall without an agent reference here,
      // so we just clear the lists
    }
    this._plugins.length = 0;
    this._tools.length = 0;
    this._middlewares.length = 0;
  }
}
