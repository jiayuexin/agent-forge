import { SimpleLogger } from '@agentforge/core';
import type {
  AgentConstructor,
  AgentCapabilityDefinition,
  AgentCapabilityRegistration,
  AgentResult,
  AgentTask,
  Capability,
  CapabilityRegistry as ICapabilityRegistry,
  ConnectToClientAgentOptions,
  EventBusHandler,
  ExecutionPlan,
  FrameworkConfig,
  IAgent,
  IClientAgentProxy,
  Logger,
  ModelConfig,
  ModelRef,
  OrchestrateOptions,
  PlanExecutionOptions,
  PlanOptions,
  PlanResult,
} from '@agentforge/types';
import {
  AgentCapabilityExecutor,
  CapabilityExecutorRegistry,
  PluginCapabilityExecutor,
  RemoteAgentCapabilityExecutor,
  SkillCapabilityExecutor,
  ToolCapabilityExecutor,
  type CapabilityExecutionContext,
  type PluginCapabilityInvoker,
  type SkillAgentFactory,
  type ToolEndpointAdapters,
} from './capability-executors/index.js';
import { CapabilityRegistry } from './CapabilityRegistry.js';
import { ClientAgentProxy, type RemoteAgentInvoker } from './ClientAgentProxy.js';
import { EventBus } from './EventBus.js';
import { ModelRegistry } from './ModelRegistry.js';
import { Pipeline, type PipelineRuntime } from './Pipeline.js';
import { PlanExecutor, type PlanExecutionContext } from './planner/PlanExecutor.js';
import { PlannerAgent, type PlannerAgentConfig } from './planner/PlannerAgent.js';
import { AgentNotFoundError, RemoteAgentNotConnectedError, SDKError } from './errors.js';

export const DEFAULT_MAX_CAPABILITY_DEPTH = 16;

export class AgentFramework implements PipelineRuntime {
  readonly discovery: ICapabilityRegistry;
  private config: FrameworkConfig;
  private eventBus: EventBus;
  private modelRegistry: ModelRegistry;
  private agentRegistry = new Map<string, AgentConstructor>();
  private agentInstances = new Map<string, IAgent>();
  private capabilityToAgent = new Map<string, IAgent>();
  private explicitCapabilityIds = new Map<string, string[]>();
  private capabilityExecutors = new CapabilityExecutorRegistry();
  private skillCapabilityExecutor: SkillCapabilityExecutor;
  private planner?: PlannerAgent;
  private planExecutor?: PlanExecutor;
  private remoteInvoker?: RemoteAgentInvoker;
  private pluginInvoker?: PluginCapabilityInvoker;
  private toolAdapters: ToolEndpointAdapters = {};
  private initialized = false;
  private logger: Logger;
  private readonly maxCapabilityDepth: number;

  constructor(config?: FrameworkConfig) {
    this.config = config ?? {};
    this.maxCapabilityDepth = this.config.maxCapabilityDepth ?? DEFAULT_MAX_CAPABILITY_DEPTH;
    if (!Number.isInteger(this.maxCapabilityDepth) || this.maxCapabilityDepth < 1) {
      throw new SDKError(
        'INVALID_MAX_CAPABILITY_DEPTH',
        'maxCapabilityDepth must be a positive integer',
        { maxCapabilityDepth: this.maxCapabilityDepth }
      );
    }
    this.discovery = new CapabilityRegistry();
    this.eventBus = new EventBus();
    this.modelRegistry = new ModelRegistry(this.config.modelRegistry);
    this.logger = new SimpleLogger({ component: 'AgentFramework' });
    this.capabilityExecutors.register(
      new AgentCapabilityExecutor((capabilityId) => this.capabilityToAgent.get(capabilityId))
    );
    this.capabilityExecutors.register(new RemoteAgentCapabilityExecutor(() => this.remoteInvoker));
    this.capabilityExecutors.register(
      new ToolCapabilityExecutor({
        getAdapters: () => this.toolAdapters,
        logger: this.logger,
      })
    );
    this.skillCapabilityExecutor = new SkillCapabilityExecutor({
      resolveModel: () => this.resolveModel(),
      getAdapters: () => this.toolAdapters,
      logger: this.logger,
      maxToolCalls: this.config.maxToolCalls,
    });
    this.capabilityExecutors.register(this.skillCapabilityExecutor);
    this.capabilityExecutors.register(new PluginCapabilityExecutor(() => this.pluginInvoker));
  }

  register(
    name: string,
    AgentClass: AgentConstructor,
    capability?: AgentCapabilityRegistration
  ): this {
    this.agentRegistry.set(name, AgentClass);

    const cap = capability ?? AgentClass.capability;
    if (cap) {
      const fullCapability: AgentCapabilityDefinition = {
        ...cap,
        id: cap.id ?? `${name}:${cap.name ?? 'default'}`,
        type: 'agent',
        name: cap.name ?? name,
        description: cap.description ?? `Agent ${name}`,
      };
      this.discovery.register(fullCapability);
      const ids = this.explicitCapabilityIds.get(name) ?? [];
      this.explicitCapabilityIds.set(name, [...ids, fullCapability.id]);
    }

    return this;
  }

  get(name: string): IAgent {
    const agent = this.agentInstances.get(name);
    if (!agent) {
      throw new AgentNotFoundError(name);
    }
    return agent;
  }

  async loadAll(): Promise<void> {
    for (const [name, AgentClass] of this.agentRegistry) {
      if (this.agentInstances.has(name)) continue;

      const agent = new AgentClass();
      await agent.init();
      this.agentInstances.set(name, agent);
      for (const capabilityId of this.explicitCapabilityIds.get(name) ?? []) {
        this.capabilityToAgent.set(capabilityId, agent);
      }

      for (const cap of agent.capabilities) {
        const capability: Capability = {
          id: `${agent.id}:${cap.name}`,
          type: 'agent',
          name: cap.name,
          description: cap.description,
          inputSchema: cap.inputSchema,
          outputSchema: cap.outputSchema,
          riskLevel: cap.riskLevel,
          sensitiveOperations: cap.sensitiveOperations,
          version: agent.version,
        };
        this.discovery.register(capability);
        this.capabilityToAgent.set(capability.id, agent);
      }
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.loadAll();
    this.initialized = true;
  }

  async destroy(): Promise<void> {
    for (const agent of this.agentInstances.values()) {
      await agent.destroy();
    }
    this.agentInstances.clear();
    this.capabilityToAgent.clear();
    this.explicitCapabilityIds.clear();
    this.agentRegistry.clear();
    this.initialized = false;
  }

  async run(name: string, task: AgentTask): Promise<AgentResult> {
    if (!this.initialized) await this.init();
    const agent = this.get(name);
    return agent.execute(task);
  }

  async plan(task: AgentTask, options?: PlanOptions): Promise<ExecutionPlan> {
    if (!this.initialized) await this.init();
    if (!this.planner) {
      this.planner = await this.createPlannerAgent();
    }
    return this.planner.plan(task, options);
  }

  async executePlan(plan: ExecutionPlan, options?: PlanExecutionOptions): Promise<PlanResult> {
    if (!this.initialized) await this.init();
    if (!this.planExecutor) {
      if (!this.planner) {
        this.planner = await this.createPlannerAgent();
      }
      this.planExecutor = this.createPlanExecutor();
    }
    return this.planExecutor.execute(plan, options);
  }

  async orchestrate(task: AgentTask, options?: OrchestrateOptions): Promise<PlanResult> {
    const plan = await this.plan(task, options);
    return this.executePlan(plan, options);
  }

  pipeline(name?: string): Pipeline {
    return new Pipeline(name).attachRuntime(this);
  }

  setRemoteAgentInvoker(invoker: RemoteAgentInvoker): this {
    this.remoteInvoker = invoker;
    return this;
  }

  setToolAdapters(adapters: ToolEndpointAdapters): this {
    this.toolAdapters = adapters;
    return this;
  }

  setPluginInvoker(invoker: PluginCapabilityInvoker): this {
    this.pluginInvoker = invoker;
    return this;
  }

  setSkillAgentFactory(agentFactory: SkillAgentFactory): this {
    this.skillCapabilityExecutor.setAgentFactory(agentFactory);
    return this;
  }

  async connectToClientAgent(
    nodeId: string,
    options?: ConnectToClientAgentOptions
  ): Promise<IClientAgentProxy> {
    void options;
    if (!this.remoteInvoker) {
      throw new RemoteAgentNotConnectedError();
    }
    return new ClientAgentProxy(nodeId, this.remoteInvoker);
  }

  on(event: string, handler: EventBusHandler): this {
    this.eventBus.on(event, handler);
    return this;
  }

  once(event: string, handler: EventBusHandler): this {
    this.eventBus.once(event, handler);
    return this;
  }

  off(event: string, handler: EventBusHandler): this {
    this.eventBus.off(event, handler);
    return this;
  }

  removeAllListeners(event?: string): this {
    this.eventBus.removeAllListeners(event);
    return this;
  }

  emit(event: string, data: unknown): void {
    this.eventBus.emit(event, data);
  }

  // PipelineRuntime implementation
  getAgent(name: string): IAgent {
    const agent = this.agentInstances.get(name);
    if (!agent) {
      throw new AgentNotFoundError(name);
    }
    return agent;
  }

  resolveModel(model?: string | ModelRef, defaultModel?: string): ModelConfig {
    return this.modelRegistry.resolve(model, defaultModel);
  }

  private async createPlannerAgent(): Promise<PlannerAgent> {
    const modelConfig = this.resolveModel();
    const config: PlannerAgentConfig = {
      identity: { name: 'planner', role: 'planner', version: '1.0.0' },
      model: modelConfig,
      systemPrompt: 'You are a planning agent for AgentForge.',
      availableCapabilities: this.discovery.list(),
      allowPlanning: true,
      temperature: 0.2,
      maxTokens: 4096,
      maxReplanAttempts: 3,
    };
    const planner = new PlannerAgent(config, this.discovery as CapabilityRegistry, (capability) =>
      this.canExecuteCapability(capability.id)
    );
    await planner.init();
    return planner;
  }

  private createPlanExecutor(): PlanExecutor {
    const context: PlanExecutionContext = {
      executeCapability: (capabilityId, task) => this.executeCapability(capabilityId, task),
      registry: this.discovery as CapabilityRegistry,
      planner: this.planner!,
      logger: this.logger,
    };
    return new PlanExecutor(context);
  }

  async executeCapability(capabilityId: string, task: AgentTask): Promise<AgentResult> {
    return this.executeCapabilityWithContext(capabilityId, task);
  }

  private async executeCapabilityWithContext(
    capabilityId: string,
    task: AgentTask,
    parentContext?: CapabilityExecutionContext
  ): Promise<AgentResult> {
    const cap = this.discovery.get(capabilityId);
    if (!cap) {
      throw new SDKError('CAPABILITY_NOT_FOUND', `Capability "${capabilityId}" not found`);
    }

    const parentCallStack = parentContext?.callStack ?? [];
    const callStack = Object.freeze([...parentCallStack, capabilityId]);
    if (parentCallStack.includes(capabilityId)) {
      throw new SDKError(
        'CAPABILITY_EXECUTION_CYCLE',
        `Capability execution cycle detected at "${capabilityId}"`,
        { callStack }
      );
    }
    if (callStack.length > this.maxCapabilityDepth) {
      throw new SDKError(
        'MAX_CAPABILITY_DEPTH_EXCEEDED',
        `Capability execution exceeded maximum depth ${this.maxCapabilityDepth}`,
        { maxDepth: this.maxCapabilityDepth, callStack }
      );
    }
    const context = this.createCapabilityExecutionContext(callStack);
    return this.capabilityExecutors.execute(cap, task, context);
  }

  private canExecuteCapability(
    capabilityId: string,
    context?: CapabilityExecutionContext
  ): boolean {
    const capability = this.discovery.get(capabilityId);
    if (!capability) return false;
    const executionContext = context ?? this.createCapabilityExecutionContext(Object.freeze([]));
    return this.capabilityExecutors.canExecute(capability, executionContext);
  }

  private createCapabilityExecutionContext(
    callStack: readonly string[]
  ): CapabilityExecutionContext {
    const context: CapabilityExecutionContext = Object.freeze({
      callStack,
      maxDepth: this.maxCapabilityDepth,
      capabilities: this.discovery,
      executeCapability: (capabilityId: string, task: AgentTask) =>
        this.executeCapabilityWithContext(capabilityId, task, context),
      canExecuteCapability: (capabilityId: string) =>
        this.canExecuteCapability(capabilityId, context),
    });
    return context;
  }
}
