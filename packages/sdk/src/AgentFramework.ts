import { SimpleLogger } from '@agentforge/core';
import type {
  AgentConstructor,
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
  RemoteAgentCapability,
} from '@agentforge/types';
import { CapabilityRegistry } from './CapabilityRegistry.js';
import { ClientAgentProxy, type RemoteAgentInvoker } from './ClientAgentProxy.js';
import { EventBus } from './EventBus.js';
import { ModelRegistry } from './ModelRegistry.js';
import { Pipeline, type PipelineRuntime } from './Pipeline.js';
import { PlanExecutor, type PlanExecutionContext } from './planner/PlanExecutor.js';
import { PlannerAgent, type PlannerAgentConfig } from './planner/PlannerAgent.js';
import { AgentNotFoundError, RemoteAgentNotConnectedError, SDKError } from './errors.js';

export class AgentFramework implements PipelineRuntime {
  readonly discovery: ICapabilityRegistry;
  private config: FrameworkConfig;
  private eventBus: EventBus;
  private modelRegistry: ModelRegistry;
  private agentRegistry = new Map<string, AgentConstructor>();
  private agentInstances = new Map<string, IAgent>();
  private capabilityToAgent = new Map<string, IAgent>();
  private planner?: PlannerAgent;
  private planExecutor?: PlanExecutor;
  private remoteInvoker?: RemoteAgentInvoker;
  private initialized = false;
  private logger: Logger;

  constructor(config?: FrameworkConfig) {
    this.config = config ?? {};
    this.discovery = new CapabilityRegistry();
    this.eventBus = new EventBus();
    this.modelRegistry = new ModelRegistry(this.config.modelRegistry);
    this.logger = new SimpleLogger({ component: 'AgentFramework' });
  }

  register(name: string, AgentClass: AgentConstructor, capability?: Partial<Capability>): this {
    this.agentRegistry.set(name, AgentClass);

    if (capability || AgentClass.capability) {
      const cap = (capability ?? AgentClass.capability) as Partial<Capability>;
      const fullCapability: Capability = {
        id: cap.id ?? `${name}:${cap.name ?? 'default'}`,
        type: cap.type ?? 'agent',
        name: cap.name ?? name,
        description: cap.description ?? `Agent ${name}`,
        ...cap,
      } as Capability;
      this.discovery.register(fullCapability);
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

  async connectToClientAgent(nodeId: string, options?: ConnectToClientAgentOptions): Promise<IClientAgentProxy> {
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
    const planner = new PlannerAgent(config, this.discovery as CapabilityRegistry);
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

  private async executeCapability(capabilityId: string, task: AgentTask): Promise<AgentResult> {
    const cap = this.discovery.get(capabilityId);
    if (!cap) {
      throw new SDKError('CAPABILITY_NOT_FOUND', `Capability "${capabilityId}" not found`);
    }

    if (cap.type === 'agent') {
      const agent = this.capabilityToAgent.get(capabilityId);
      if (!agent) {
        throw new SDKError('CAPABILITY_AGENT_NOT_FOUND', `No agent provides capability "${capabilityId}"`);
      }
      return agent.execute(task);
    }

    if (cap.type === 'remote-agent') {
      if (!this.remoteInvoker) {
        throw new RemoteAgentNotConnectedError();
      }
      const remoteCap = cap as RemoteAgentCapability;
      const proxy = new ClientAgentProxy(remoteCap.nodeId, this.remoteInvoker);
      return proxy.execute(task);
    }

    throw new SDKError('NOT_IMPLEMENTED', `Capability type "${cap.type}" execution is not implemented`);
  }
}
