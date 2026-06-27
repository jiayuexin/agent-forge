import type {
  AgentConfig,
  Capability,
  IAgent,
  IPlugin,
  Logger,
  Middleware,
  PluginContext,
  ToolDefinition,
} from '@agentforge/types';

export class PluginManager {
  private plugins = new Map<string, IPlugin>();
  private tools: ToolDefinition[] = [];
  private middlewares: Middleware[] = [];

  constructor(
    private agent: IAgent,
    private config: AgentConfig,
    private logger: Logger
  ) {}

  register(plugin: IPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }

    this.plugins.set(plugin.name, plugin);

    const context: PluginContext = {
      config: this.config,
      logger: this.logger,
      registerTool: (tool) => this.tools.push(tool),
      registerMiddleware: (middleware) => this.middlewares.push(middleware),
    };

    plugin.install(this.agent, context);
  }

  unregister(plugin: IPlugin): void {
    if (!this.plugins.has(plugin.name)) {
      return;
    }

    this.plugins.delete(plugin.name);
    plugin.uninstall?.(this.agent);
  }

  getTools(): ToolDefinition[] {
    return [...this.tools];
  }

  getMiddlewares(): Middleware[] {
    return [...this.middlewares];
  }

  getCapabilities(): Capability[] {
    const capabilities: Capability[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.capabilities) {
        capabilities.push(...plugin.capabilities());
      }
    }
    return capabilities;
  }
}
