import {
  CoreError,
  ToolRegistry,
  ToolRunner,
  WasiPluginRunner,
  type ToolAdapterMap,
  type ToolExecutionRecord,
  type WasiPluginExecutionContext,
} from '@agentforge/core';
import type {
  AgentResult,
  AgentTask,
  Capability,
  ClientCapabilitySource,
  IClientAgent,
  Logger,
  PluginCapability,
  SkillCapability,
  ToolCapability,
  ToolDefinition,
} from '@agentforge/types';

const DEFAULT_MAX_CAPABILITY_DEPTH = 16;

export interface CachedCapabilityStore {
  readonly trustStoreDir?: string;
  list(): Capability[];
  get(id: string): Capability | undefined;
  readPluginArtifact(capabilityId: string): Promise<Uint8Array>;
}

export interface CachedPluginRunner {
  execute(
    capability: PluginCapability,
    task: AgentTask,
    context: WasiPluginExecutionContext
  ): Promise<AgentResult>;
}

export interface CachedCapabilitySourceOptions {
  cache: CachedCapabilityStore;
  agent: IClientAgent;
  logger: Logger;
  adapters: ToolAdapterMap;
  pluginRunner?: CachedPluginRunner;
  maxDepth?: number;
}

export class CachedCapabilitySource implements ClientCapabilitySource {
  private readonly maxDepth: number;
  private readonly pluginRunner: CachedPluginRunner;

  constructor(private readonly options: CachedCapabilitySourceOptions) {
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_CAPABILITY_DEPTH;
    if (!Number.isInteger(this.maxDepth) || this.maxDepth < 1) {
      throw new CoreError('INVALID_MAX_CAPABILITY_DEPTH', 'maxDepth must be a positive integer');
    }
    this.pluginRunner =
      options.pluginRunner ??
      new WasiPluginRunner({
        trustStoreDir: options.cache.trustStoreDir,
        artifactLoader: (capability) => options.cache.readPluginArtifact(capability.id),
      });
  }

  listCapabilities(): readonly Capability[] {
    return this.options.cache.list();
  }

  listTools(): readonly ToolDefinition[] {
    return this.options.cache
      .list()
      .filter((capability): capability is ToolCapability | SkillCapability | PluginCapability =>
        this.isAgentTool(capability)
      )
      .map((capability) => this.createAgentTool(capability));
  }

  executeCapability(capabilityId: string, task: AgentTask): Promise<AgentResult> {
    return this.executeWithContext(capabilityId, task, Object.freeze([]));
  }

  private async executeWithContext(
    capabilityId: string,
    task: AgentTask,
    parentCallStack: readonly string[]
  ): Promise<AgentResult> {
    const callStack = Object.freeze([...parentCallStack, capabilityId]);
    if (parentCallStack.includes(capabilityId)) {
      throw new CoreError(
        'CAPABILITY_EXECUTION_CYCLE',
        `Capability execution cycle detected at "${capabilityId}"`
      );
    }
    if (callStack.length > this.maxDepth) {
      throw new CoreError(
        'MAX_CAPABILITY_DEPTH_EXCEEDED',
        `Capability execution exceeded maximum depth ${this.maxDepth}`
      );
    }

    const capability = this.options.cache.get(capabilityId);
    if (!capability) {
      throw new CoreError(
        'CAPABILITY_NOT_FOUND',
        `Cached capability "${capabilityId}" was not found`
      );
    }

    switch (capability.type) {
      case 'tool':
        return this.executeTool(capability, task);
      case 'skill':
        return this.executeSkill(capability, task, callStack);
      case 'plugin':
        return this.pluginRunner.execute(capability, task, {
          executeCapability: (nestedId, nestedTask) =>
            this.executeWithContext(nestedId, nestedTask, callStack),
        });
      case 'agent':
      case 'remote-agent':
        throw new CoreError(
          'CACHED_CAPABILITY_NOT_EXECUTABLE',
          `Cached capability type "${capability.type}" is not locally executable`
        );
    }
  }

  private async executeTool(capability: ToolCapability, task: AgentTask): Promise<AgentResult> {
    const startedAt = Date.now();
    const definition = capabilityToToolDefinition(capability);
    const record = await new ToolRunner({
      registry: new ToolRegistry([definition]),
      agent: this.options.agent,
      logger: this.options.logger,
      adapters: this.options.adapters,
    }).execute({
      callId: `${capability.id}:cached`,
      name: capability.name,
      args: task.input,
    });
    return recordToAgentResult(record, startedAt);
  }

  private executeSkill(
    capability: SkillCapability,
    task: AgentTask,
    callStack: readonly string[]
  ): Promise<AgentResult> {
    const tools = this.resolveSkillTools(capability).map((tool) => ({
      ...capabilityToToolDefinition(tool),
      handler: async (args: Record<string, unknown>) => {
        const result = await this.executeWithContext(
          tool.id,
          {
            type: 'skill-tool',
            input: args,
            context: task.context,
            meta: task.meta,
          },
          callStack
        );
        return unwrapCapabilityResult(tool.id, result);
      },
    }));
    return this.options.agent.executeScopedTask(task, {
      systemPrompt: capability.promptTemplate,
      tools,
    });
  }

  private resolveSkillTools(capability: SkillCapability): ToolCapability[] {
    const seen = new Set<string>();
    return capability.tools.map((id) => {
      if (seen.has(id)) {
        throw new CoreError(
          'SKILL_TOOL_DUPLICATE',
          `Skill "${capability.id}" declares tool "${id}" more than once`
        );
      }
      seen.add(id);
      const dependency = this.options.cache.get(id);
      if (!dependency) {
        throw new CoreError(
          'SKILL_TOOL_NOT_FOUND',
          `Skill "${capability.id}" requires missing tool "${id}"`
        );
      }
      if (dependency.type !== 'tool') {
        throw new CoreError(
          'SKILL_TOOL_INVALID_TYPE',
          `Skill "${capability.id}" requires "${id}" to be a ToolCapability`
        );
      }
      if (!this.options.adapters[dependency.endpointType]) {
        throw new CoreError(
          'SKILL_TOOL_NOT_EXECUTABLE',
          `Skill "${capability.id}" requires unavailable tool "${id}"`
        );
      }
      return dependency;
    });
  }

  private isAgentTool(
    capability: Capability
  ): capability is ToolCapability | SkillCapability | PluginCapability {
    if (capability.type === 'tool') {
      return this.options.adapters[capability.endpointType] !== undefined;
    }
    if (capability.type === 'skill') {
      try {
        this.resolveSkillTools(capability);
        return true;
      } catch {
        return false;
      }
    }
    return capability.type === 'plugin';
  }

  private createAgentTool(
    capability: ToolCapability | SkillCapability | PluginCapability
  ): ToolDefinition {
    return {
      name: capability.name,
      description: capability.description,
      parameters: capability.inputSchema ?? { type: 'object' },
      handler: async (args) => {
        const result = await this.executeCapability(capability.id, {
          type: `cached-${capability.type}`,
          input: args,
        });
        return unwrapCapabilityResult(capability.id, result);
      },
    };
  }
}

function capabilityToToolDefinition(capability: ToolCapability): ToolDefinition {
  return {
    name: capability.name,
    description: capability.description,
    parameters: capability.inputSchema,
    endpointType: capability.endpointType,
    endpoint: capability.endpoint,
  };
}

function recordToAgentResult(record: ToolExecutionRecord, startedAt: number): AgentResult {
  const meta = {
    duration: Date.now() - startedAt,
    tokensUsed: { input: 0, output: 0, total: 0 },
    model: 'cached-tool',
    toolsCalled: [record],
  };
  if (record.status === 'error') {
    return {
      success: false,
      output: { content: '' },
      meta,
      error: {
        code: record.errorCode ?? 'TOOL_EXECUTION_FAILED',
        message: record.error ?? `Tool "${record.name}" execution failed`,
        details: { record },
      },
    };
  }
  return {
    success: true,
    output: {
      content: typeof record.result === 'string' ? record.result : JSON.stringify(record.result),
      structured: { result: record.result },
    },
    meta,
  };
}

function unwrapCapabilityResult(capabilityId: string, result: AgentResult): unknown {
  if (!result.success) {
    throw new CoreError(
      result.error?.code ?? 'CAPABILITY_EXECUTION_FAILED',
      result.error?.message ?? `Capability "${capabilityId}" execution failed`
    );
  }
  const structured = result.output.structured;
  if (structured && Object.prototype.hasOwnProperty.call(structured, 'result')) {
    return structured.result;
  }
  return structured ?? result.output.content;
}
