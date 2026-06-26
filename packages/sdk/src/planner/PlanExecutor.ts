import type {
  AgentResult,
  AgentTask,
  CapabilityRegistry,
  ExecutionPlan,
  IPlanExecutor,
  IPlannerAgent,
  Logger,
  PlanContext,
  PlanExecutionOptions,
  PlanResult,
  PlanStep,
  StepResult,
} from '@agentforge/types';
import { ApprovalRequiredError, SDKError, VariableNotFoundError } from '../errors.js';
import { interpolateInput } from './utils.js';

export interface PlanExecutionContext {
  executeCapability(capabilityId: string, task: AgentTask): Promise<AgentResult>;
  registry: CapabilityRegistry;
  planner: IPlannerAgent;
  logger: Logger;
}

export class PlanExecutor implements IPlanExecutor {
  constructor(private context: PlanExecutionContext) {}

  async execute(plan: ExecutionPlan, options?: PlanExecutionOptions): Promise<PlanResult> {
    const startedAt = Date.now();
    const stepTimeout = options?.stepTimeout ?? 30000;
    const maxReplanAttempts = options?.maxReplanAttempts ?? 3;

    await this.checkApproval(plan, options);

    let currentPlan = plan;
    let stepResults = new Map<string, StepResult>();
    let outputAsMap = new Map(currentPlan.steps.map((s) => [s.id, s.outputAs]));
    let replanAttempts = 0;
    let lastSuccessfulOutput: AgentResult['output'] = { content: '' };

    while (true) {
      const completedIds = new Set<string>();
      const failedIds = new Set<string>();

      for (const [id, result] of stepResults) {
        if (result.success) completedIds.add(id);
        else failedIds.add(id);
      }

      const pending = currentPlan.steps.filter((s) => !completedIds.has(s.id) && !failedIds.has(s.id));

      if (pending.length === 0) {
        if (failedIds.size > 0) {
          return this.buildResult(false, currentPlan, stepResults, startedAt, lastSuccessfulOutput);
        }
        return this.buildResult(true, currentPlan, stepResults, startedAt, lastSuccessfulOutput);
      }

      const ready = pending.filter((s) =>
        (s.dependsOn ?? []).every((dep) => completedIds.has(dep))
      );

      if (ready.length === 0) {
        const blocked = pending.filter(
          (s) =>
            (s.dependsOn ?? []).some((dep) => failedIds.has(dep)) ||
            (s.dependsOn ?? []).some((dep) => !completedIds.has(dep) && !pending.some((p) => p.id === dep))
        );
        if (blocked.length > 0) {
          for (const step of blocked) {
            if (!failedIds.has(step.id)) {
              stepResults.set(step.id, {
                stepId: step.id,
                success: false,
                output: null,
                duration: 0,
                error: { code: 'DEPENDENCY_FAILED', message: 'A dependency failed or is missing' },
              });
            }
          }
          continue;
        }
        return this.buildResult(false, currentPlan, stepResults, startedAt, lastSuccessfulOutput, {
          code: 'PLAN_CYCLE',
          message: 'No ready steps but pending steps remain',
        });
      }

      const executed = await Promise.all(
        ready.map((step) => this.executeStep(step, stepResults, outputAsMap, stepTimeout))
      );

      let anyFailed = false;
      for (const result of executed) {
        stepResults.set(result.stepId, result);
        if (result.success) {
          const agentResult = result.output as AgentResult;
          if (agentResult?.output) {
            lastSuccessfulOutput = agentResult.output;
          }
        } else {
          anyFailed = true;
        }
      }

      if (anyFailed) {
        if (replanAttempts >= maxReplanAttempts) {
          return this.buildResult(false, currentPlan, stepResults, startedAt, lastSuccessfulOutput);
        }

        const failedStep = executed.find((r) => !r.success)!;
        const completed = Array.from(stepResults.values()).filter((r) => r.success);
        const remaining = currentPlan.steps.filter((s) => !stepResults.has(s.id));

        const planContext: PlanContext = {
          task: { type: 'plan', input: { goal: currentPlan.goal } },
          plan: currentPlan,
          failedStep,
          completedSteps: completed,
          remainingSteps: remaining,
          userInput: {},
          attemptNumber: replanAttempts + 1,
        };

        currentPlan = await this.context.planner.replan(failedStep, planContext);
        outputAsMap = new Map(currentPlan.steps.map((s) => [s.id, s.outputAs]));
        stepResults = new Map();
        replanAttempts++;
      }
    }
  }

  private async checkApproval(plan: ExecutionPlan, options?: PlanExecutionOptions): Promise<void> {
    const requiresApproval =
      plan.constraints?.requireApproval === true || this.hasHighRiskCapability(plan);

    if (!requiresApproval) return;

    if (!options?.approvalHandler) {
      throw new ApprovalRequiredError();
    }

    const result = await options.approvalHandler(plan);
    if (!result.approved) {
      throw new ApprovalRequiredError(result.reason ?? 'Plan approval rejected');
    }
    if (result.modifiedPlan) {
      Object.assign(plan, result.modifiedPlan);
    }
  }

  private hasHighRiskCapability(plan: ExecutionPlan): boolean {
    for (const id of plan.capabilitiesUsed) {
      const cap = this.context.registry.get(id);
      if (cap?.riskLevel === 'high') return true;
      if (cap?.sensitiveOperations && cap.sensitiveOperations.length > 0) return true;
    }
    return false;
  }

  private async executeStep(
    step: PlanStep,
    stepResults: Map<string, StepResult>,
    outputAsMap: Map<string, string | undefined>,
    timeout: number
  ): Promise<StepResult> {
    const startedAt = Date.now();
    try {
      const variables = this.buildVariables(stepResults, outputAsMap);
      const interpolatedInput = interpolateInput(step.input, variables);

      const task: AgentTask = {
        type: 'plan-step',
        input: { task: step.task, ...interpolatedInput },
      };

      const result = await Promise.race([
        this.context.executeCapability(step.capability, task),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new SDKError('STEP_TIMEOUT', `Step "${step.id}" timed out`)), timeout)
        ),
      ]);

      return {
        stepId: step.id,
        success: result.success,
        output: result,
        duration: Date.now() - startedAt,
        error: result.error,
      };
    } catch (error) {
      return {
        stepId: step.id,
        success: false,
        output: null,
        duration: Date.now() - startedAt,
        error:
          error instanceof VariableNotFoundError || error instanceof SDKError
            ? { code: error.code, message: error.message }
            : { code: 'STEP_EXECUTION_FAILED', message: (error as Error).message },
      };
    }
  }

  private buildVariables(
    stepResults: Map<string, StepResult>,
    outputAsMap: Map<string, string | undefined>
  ): Record<string, AgentResult> {
    const variables: Record<string, AgentResult> = {};
    for (const result of stepResults.values()) {
      if (result.success && result.output) {
        variables[result.stepId] = result.output as AgentResult;
        const alias = outputAsMap.get(result.stepId);
        if (alias) {
          variables[alias] = result.output as AgentResult;
        }
      }
    }
    return variables;
  }

  private buildResult(
    success: boolean,
    plan: ExecutionPlan,
    stepResults: Map<string, StepResult>,
    startedAt: number,
    lastOutput: AgentResult['output'],
    error?: { code: string; message: string }
  ): PlanResult {
    const results = Array.from(stepResults.values());
    return {
      success,
      output: lastOutput,
      plan,
      stepResults: results,
      totalDuration: Date.now() - startedAt,
      ...(error ? { error } : {}),
    } as PlanResult;
  }
}
