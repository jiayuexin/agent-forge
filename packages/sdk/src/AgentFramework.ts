import type {
  FrameworkConfig,
  AgentConfig,
  AgentTask,
  AgentResult,
  IAgent,
  ModelRegistry as ModelRegistryType,
  ModelEndpoint,
  ModelRef,
} from '@agentforge/types';
import { AgentRegistry } from '@agentforge/core';
import { Pipeline } from './Pipeline';
import { EventBus } from './EventBus';

/** Error thrown when a model cannot be resolved from the ModelRegistry. */
export class ModelNotFoundError extends Error {
  constructor(model: string, endpoint?: string) {
    super(
      endpoint
        ? `Model "${model}" not found on endpoint "${endpoint}"`
        : `Model "${model}" not found in any registered endpoint`,
    );
    this.name = 'ModelNotFoundError';
  }
}

/**
 * AgentFramework — main orchestrator for multi-agent systems.
 *
 * Provides agent registration, initialization, pipeline creation,
 * event bus, and model registry resolution.
 */
export class AgentFramework {
  private readonly registry = new AgentRegistry();
  private readonly eventBus = new EventBus();
  private readonly config_: FrameworkConfig;
  private readonly agentClasses = new Map<string, new () => IAgent>();
  private initialized = false;

  constructor(config?: FrameworkConfig) {
    this.config_ = config ?? {};
  }

  /** Register an agent class under a given name. The agent is instantiated during init(). */
  register(name: string, AgentClass: new () => IAgent): this {
    this.agentClasses.set(name, AgentClass);
    return this;
  }

  /** Retrieve a registered agent by name. Must be called after init(). */
  get(name: string): IAgent {
    const agent = this.registry.get(name);
    if (!agent) {
      throw new Error(`Agent "${name}" not found. Make sure it is registered and init() has been called.`);
    }
    return agent;
  }

  /** Initialize all registered agents. This instantiates each agent class and calls init(). */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    for (const [name, AgentClass] of this.agentClasses) {
      const agent = new AgentClass();
      // Build a minimal AgentConfig for the agent
      const config = this.buildAgentConfig(name);
      await agent.init(config);
      this.registry.register(name, agent);
    }

    this.initialized = true;
  }

  /** Run a single agent by name with the given task. */
  async run(name: string, task: AgentTask): Promise<AgentResult> {
    const agent = this.get(name);
    return agent.execute(task);
  }

  /** Create a new pipeline for multi-step agent orchestration. */
  pipeline(name?: string): Pipeline {
    return new Pipeline(
      name ?? 'default',
      this.registry,
      this.resolveModel.bind(this),
    );
  }

  // --- Event bus delegation ---

  /** Subscribe to an event. */
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): this {
    this.eventBus.on(event, handler);
    return this;
  }

  /** Subscribe to an event once. */
  once(event: string, handler: (...args: unknown[]) => void | Promise<void>): this {
    this.eventBus.once(event, handler);
    return this;
  }

  /** Unsubscribe from an event. */
  off(event: string, handler: (...args: unknown[]) => void | Promise<void>): this {
    this.eventBus.off(event, handler);
    return this;
  }

  /** Emit an event. */
  emit(event: string, ...args: unknown[]): void {
    this.eventBus.emit(event, ...args);
  }

  /** Destroy all registered agents and clean up. */
  async destroy(): Promise<void> {
    for (const name of this.registry.list()) {
      const agent = this.registry.get(name);
      if (agent) {
        await agent.destroy();
      }
    }
    this.registry.clear();
    this.agentClasses.clear();
    this.eventBus.removeAllListeners();
    this.initialized = false;
  }

  // --- Private helpers ---

  /** Build a minimal AgentConfig for an agent based on the framework's model registry. */
  private buildAgentConfig(name: string): AgentConfig {
    const modelRegistry = this.config_.modelRegistry;
    let modelConfig: AgentConfig['model'];

    if (modelRegistry) {
      // Use the default model from the registry
      const defaultModel = modelRegistry.defaultModel ?? 'gpt-4o';
      const defaultEndpoint = modelRegistry.defaultEndpoint;
      const endpoint = modelRegistry.endpoints.find((ep) => ep.id === defaultEndpoint)
        ?? modelRegistry.endpoints[0];

      if (endpoint) {
        modelConfig = {
          provider: endpoint.provider,
          modelName: defaultModel,
          apiKey: endpoint.apiKey,
          baseUrl: endpoint.baseUrl,
        };
      } else {
        // Fallback to a minimal config
        modelConfig = {
          provider: 'openai',
          modelName: defaultModel,
          apiKey: '',
        };
      }
    } else {
      // No model registry configured — use a placeholder config
      modelConfig = {
        provider: 'openai',
        modelName: 'gpt-4o',
        apiKey: '',
      };
    }

    return {
      model: modelConfig,
      systemPrompt: `You are agent "${name}".`,
    };
  }

  /**
   * Resolve a model reference using the framework's ModelRegistry.
   *
   * Rules:
   * 1. If ModelRef with endpoint → use that endpoint
   * 2. If just model name → find first endpoint with that model
   * 3. Fallback to defaultModel + defaultEndpoint
   * 4. Throw ModelNotFoundError if nothing matches
   */
  private resolveModel(model: string | ModelRef): unknown {
    const modelRegistry = this.config_.modelRegistry;
    if (!modelRegistry) {
      throw new ModelNotFoundError(typeof model === 'string' ? model : model.model);
    }

    // Parse the model reference
    const modelName = typeof model === 'string' ? model : model.model;
    const endpointId = typeof model === 'string' ? undefined : model.endpoint;

    // Rule 1: If endpoint is specified, find that endpoint
    if (endpointId) {
      const endpoint = modelRegistry.endpoints.find((ep) => ep.id === endpointId);
      if (endpoint && endpoint.models.includes(modelName)) {
        return { model: modelName, endpoint, provider: endpoint.provider };
      }
      throw new ModelNotFoundError(modelName, endpointId);
    }

    // Rule 2: Find first endpoint with this model
    const matchingEndpoint = modelRegistry.endpoints.find((ep) =>
      ep.models.includes(modelName),
    );
    if (matchingEndpoint) {
      return { model: modelName, endpoint: matchingEndpoint, provider: matchingEndpoint.provider };
    }

    // Rule 3: Fallback to defaultModel + defaultEndpoint
    if (modelRegistry.defaultModel && modelRegistry.defaultEndpoint) {
      const defaultEp = modelRegistry.endpoints.find(
        (ep) => ep.id === modelRegistry.defaultEndpoint,
      );
      if (defaultEp) {
        return {
          model: modelRegistry.defaultModel,
          endpoint: defaultEp,
          provider: defaultEp.provider,
        };
      }
    }

    // Rule 4: Nothing found
    throw new ModelNotFoundError(modelName);
  }
}
