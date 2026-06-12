import type { IAgent, AgentConfig, IPlugin, PluginContext, ToolDefinition, Middleware, Logger } from '@agentforge/types';

/** Minimal console-based logger for PluginContext when no agent logger is available */
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
 * PluginContext implementation that delegates registration calls to a PluginManager.
 */
export class DefaultPluginContext implements PluginContext {
  private readonly _tools: ToolDefinition[] = [];
  private readonly _middlewares: Middleware[] = [];

  constructor(
    private readonly _config: AgentConfig,
    private readonly _logger: Logger = defaultLogger,
  ) {}

  get config(): AgentConfig {
    return this._config;
  }

  get logger(): Logger {
    return this._logger;
  }

  /** Registered tools (collected during plugin install) */
  get tools(): ReadonlyArray<ToolDefinition> {
    return this._tools;
  }

  /** Registered middlewares (collected during plugin install) */
  get middlewares(): ReadonlyArray<Middleware> {
    return this._middlewares;
  }

  registerTool(tool: ToolDefinition): void {
    this._tools.push(tool);
  }

  registerMiddleware(middleware: Middleware): void {
    this._middlewares.push(middleware);
  }
}
