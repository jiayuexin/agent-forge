import { randomUUID } from 'node:crypto';
import { StatelessAgent } from '@agentforge/core';
import type { BaseAgentOptions } from '@agentforge/core';
import type {
  AgentResult,
  AgentTask,
  IStatelessAgent,
  Logger,
  ModelConfig,
  SkillCapability,
  StatelessAgentConfig,
  ToolCapability,
  ToolDefinition,
} from '@agentforge/types';
import { SDKError } from '../errors.js';
import type { CapabilityExecutionContext, CapabilityExecutor } from './types.js';
import { toolCapabilityToDefinition, type ToolEndpointAdapters } from './ToolCapabilityExecutor.js';

export interface SkillAgentFactoryOptions {
  capability: SkillCapability;
  config: StatelessAgentConfig;
  runtimeOptions: BaseAgentOptions;
  context: CapabilityExecutionContext;
}

export type SkillAgentFactory = (
  options: SkillAgentFactoryOptions
) => IStatelessAgent | Promise<IStatelessAgent>;

export interface SkillCapabilityExecutorOptions {
  resolveModel: () => ModelConfig;
  getAdapters: () => ToolEndpointAdapters;
  logger: Logger;
  maxToolCalls?: number;
  agentFactory?: SkillAgentFactory;
}

function createDefaultSkillAgent({
  config,
  runtimeOptions,
}: SkillAgentFactoryOptions): IStatelessAgent {
  return new StatelessAgent(config, runtimeOptions);
}

export class SkillCapabilityExecutor implements CapabilityExecutor<'skill'> {
  readonly type = 'skill' as const;
  private agentFactory: SkillAgentFactory;

  constructor(private readonly options: SkillCapabilityExecutorOptions) {
    this.agentFactory = options.agentFactory ?? createDefaultSkillAgent;
  }

  setAgentFactory(agentFactory: SkillAgentFactory): void {
    this.agentFactory = agentFactory;
  }

  canExecute(capability: SkillCapability, context: CapabilityExecutionContext): boolean {
    const seen = new Set<string>();
    for (const id of capability.tools) {
      if (seen.has(id)) return false;
      seen.add(id);
      const dependency = context.capabilities.get(id);
      if (dependency?.type !== 'tool' || !context.canExecuteCapability(dependency.id)) {
        return false;
      }
    }
    try {
      this.options.resolveModel();
      return true;
    } catch {
      return false;
    }
  }

  async execute(
    capability: SkillCapability,
    task: AgentTask,
    context: CapabilityExecutionContext
  ): Promise<AgentResult> {
    const toolCapabilities = this.resolveSkillTools(capability, context);
    const tools = toolCapabilities.map((tool) => this.createRestrictedTool(tool, task, context));
    const config: StatelessAgentConfig = {
      identity: {
        id: `skill-agent-${randomUUID()}`,
        name: `skill-${capability.name}`,
        role: 'skill-executor',
        version: capability.version ?? '1.0.0',
      },
      model: this.options.resolveModel(),
      systemPrompt: capability.promptTemplate,
      tools,
      availableCapabilities: toolCapabilities,
      allowPlanning: false,
    };
    const runtimeOptions: BaseAgentOptions = {
      logger: this.options.logger,
      maxToolCalls: this.options.maxToolCalls,
      toolAdapters: this.options.getAdapters(),
    };
    const agent = await this.agentFactory({
      capability,
      config,
      runtimeOptions,
      context,
    });

    try {
      await agent.init();
      return await agent.execute(task);
    } finally {
      await agent.destroy();
    }
  }

  private resolveSkillTools(
    capability: SkillCapability,
    context: CapabilityExecutionContext
  ): ToolCapability[] {
    const seen = new Set<string>();
    return capability.tools.map((id) => {
      if (seen.has(id)) {
        throw new SDKError(
          'SKILL_TOOL_DUPLICATE',
          `Skill "${capability.id}" declares tool "${id}" more than once`
        );
      }
      seen.add(id);

      const dependency = context.capabilities.get(id);
      if (!dependency) {
        throw new SDKError(
          'SKILL_TOOL_NOT_FOUND',
          `Skill "${capability.id}" requires missing tool capability "${id}"`
        );
      }
      if (dependency.type !== 'tool') {
        throw new SDKError(
          'SKILL_TOOL_INVALID_TYPE',
          `Skill "${capability.id}" requires "${id}" to be a ToolCapability`
        );
      }
      if (!context.canExecuteCapability(id)) {
        throw new SDKError(
          'SKILL_TOOL_NOT_EXECUTABLE',
          `Skill "${capability.id}" requires unavailable tool capability "${id}"`
        );
      }
      return dependency;
    });
  }

  private createRestrictedTool(
    capability: ToolCapability,
    task: AgentTask,
    context: CapabilityExecutionContext
  ): ToolDefinition {
    return {
      ...toolCapabilityToDefinition(capability),
      handler: async (args) => {
        const result = await context.executeCapability(capability.id, {
          type: 'skill-tool',
          input: args,
          context: task.context,
          meta: task.meta,
        });
        if (!result.success) {
          throw new SDKError(
            result.error?.code ?? 'SKILL_TOOL_EXECUTION_FAILED',
            result.error?.message ?? `Skill tool "${capability.id}" execution failed`,
            result.error?.details
          );
        }
        const structured = result.output.structured;
        if (structured && Object.prototype.hasOwnProperty.call(structured, 'result')) {
          return structured.result;
        }
        return structured ?? result.output.content;
      },
    };
  }
}
