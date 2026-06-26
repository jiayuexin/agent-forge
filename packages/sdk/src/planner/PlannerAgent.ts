import { BaseAgent } from '@agentforge/core';
import type {
  AgentConfig,
  AgentResult,
  AgentTask,
  CapabilityRegistry,
  ExecutionPlan,
  IPlannerAgent,
  PlanContext,
  PlanOptions,
  PlannerConfig,
  StepResult,
} from '@agentforge/types';
import { buildPlanningPrompt, buildReplanningPrompt } from './prompts.js';

export type PlannerAgentConfig = PlannerConfig & AgentConfig;

export class PlannerAgent
  extends BaseAgent<PlannerAgentConfig>
  implements IPlannerAgent
{
  readonly registry: CapabilityRegistry;

  constructor(config: PlannerAgentConfig, registry: CapabilityRegistry) {
    super(config);
    this.registry = registry;
  }

  async plan(task: AgentTask, options?: PlanOptions): Promise<ExecutionPlan> {
    const result = await this.execute(task);
    if (!result.success || !result.output.structured) {
      throw new Error(result.error?.message ?? 'Planner failed to generate a plan');
    }
    return this.normalizePlan(result.output.structured as unknown as ExecutionPlan, options);
  }

  async replan(failedStep: StepResult, context: PlanContext): Promise<ExecutionPlan> {
    const task = context.task;
    const capabilities = this.registry.list();
    const remainingSteps = context.remainingSteps.map((s) => s.id);
    const completedSteps = context.completedSteps.map((s) => s.stepId);

    const prompt = buildReplanningPrompt(
      task,
      capabilities,
      { stepId: failedStep.stepId, error: failedStep.error },
      completedSteps,
      remainingSteps
    );

    const result = await this.provider?.chat({
      messages: [
        { role: 'system', content: 'You are a planning agent.' },
        { role: 'user', content: prompt },
      ],
      temperature: this.config?.temperature ?? 0.2,
      maxTokens: this.config?.maxTokens ?? 4096,
    });

    if (!result?.content) {
      throw new Error('Planner returned an empty replan response');
    }

    const parsed = this.parseJson(result.content);
    return this.normalizePlan(parsed as unknown as ExecutionPlan, { previousPlan: context.plan });
  }

  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    const capabilities = this.registry.list();
    const prompt = buildPlanningPrompt(task, capabilities);

    const response = await this.provider?.chat({
      messages: [
        { role: 'system', content: 'You are a planning agent.' },
        { role: 'user', content: prompt },
      ],
      temperature: this.config?.temperature ?? 0.2,
      maxTokens: this.config?.maxTokens ?? 4096,
    });

    const content = response?.content ?? '';
    const plan = this.parseJson(content);

    return {
      success: true,
      output: {
        content,
        structured: plan as Record<string, unknown>,
      },
      meta: {
        duration: 0,
        tokensUsed: response?.usage ?? { input: 0, output: 0, total: 0 },
        model: response?.model ?? 'planner',
      },
    };
  }

  private parseJson(content: string): unknown {
    const trimmed = content.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    const json = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    return JSON.parse(json);
  }

  private normalizePlan(plan: ExecutionPlan, options?: PlanOptions): ExecutionPlan {
    return {
      ...plan,
      constraints: {
        ...options?.constraints,
        ...plan.constraints,
      },
    };
  }
}
