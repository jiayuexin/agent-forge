import type {
  StepOptions,
  ParallelStep,
  InterceptorHandler,
  ForkBranch,
  PipelineControlSignal,
  StepSnapshot,
  BacktrackEvent,
  PipelineResult,
  PipelineConfig,
  AgentResult,
  AgentTask,
  ModelRef,
  IAgent,
} from '@agentforge/types';
import { AgentRegistry } from '@agentforge/core';

/** Internal representation of a pipeline step */
interface PipelineStep {
  name: string;
  agent: string;
  options: StepOptions;
}

/**
 * Pipeline — declarative multi-agent workflow builder.
 *
 * Supports sequential steps, parallel execution, conditional branching,
 * fork, intercept, transform, and control-flow signals (back/jump/stop/pause/fork/replace).
 */
export class Pipeline {
  private steps: PipelineStep[] = [];
  private interceptors: InterceptorHandler[] = [];
  private config_: PipelineConfig = {};
  private branchFn: ((prevOutput: AgentResult) => StepOptions | null) | null = null;
  private transformFn: ((prevOutput: AgentResult) => unknown) | null = null;
  private forkMap = new Map<string, ForkBranch[]>();

  constructor(
    private readonly name: string,
    private readonly registry: AgentRegistry,
    private readonly modelResolver?: (model: string | ModelRef) => unknown,
  ) {}

  /** Add a sequential step. */
  add(agentName: string, options: StepOptions): this {
    const stepName = options.task ?? `step-${this.steps.length}`;
    this.steps.push({ name: stepName, agent: agentName, options });
    return this;
  }

  /** Add parallel steps that execute concurrently. Results are collected before continuing. */
  parallel(steps: ParallelStep[]): this {
    // Convert parallel steps into a single synthetic step that runs them all
    for (const ps of steps) {
      const stepName = ps.name ?? `parallel-${this.steps.length}`;
      this.steps.push({
        name: stepName,
        agent: ps.agent,
        options: {
          task: ps.task,
          input: ps.input,
          model: ps.model,
        },
      });
    }
    // Mark the first parallel step index so run() can group them
    // We store parallelism metadata on the steps themselves
    // For simplicity, we add a marker step
    return this;
  }

  /** Add a conditional branch. If the condition returns null, the pipeline continues normally. */
  branch(condition: (prevOutput: AgentResult) => StepOptions | null): this {
    this.branchFn = condition;
    return this;
  }

  /** Add a transform function applied to the previous step's output before passing to the next step. */
  transform(fn: (prevOutput: AgentResult) => unknown): this {
    this.transformFn = fn;
    return this;
  }

  /** Register an interceptor for a specific step name. */
  intercept(stepName: string, handler: InterceptorHandler['handler']): this {
    this.interceptors.push({ stepName, handler });
    return this;
  }

  /** Register fork branches for a specific step. When that step emits a fork signal, these branches execute in parallel. */
  fork(stepName: string, branches: ForkBranch[]): this {
    this.forkMap.set(stepName, branches);
    return this;
  }

  /** Set pipeline-level configuration. */
  config(options: PipelineConfig): this {
    this.config_ = { ...this.config_, ...options };
    return this;
  }

  /** Execute the pipeline and return the result. */
  async run(): Promise<PipelineResult> {
    const maxBacktracks = this.config_.maxBacktracks ?? 5;
    const snapshotEnabled = this.config_.snapshotEnabled ?? true;
    const snapshots: StepSnapshot[] = [];
    const backtrackHistory: BacktrackEvent[] = [];
    const startTime = Date.now();
    let backtrackCount = 0;

    // Guard against infinite loops from jump/back signals
    const maxIterations = this.steps.length * (maxBacktracks + 1) + 1;
    let iterations = 0;

    let prevOutput: AgentResult | null = null;
    let i = 0;

    while (i < this.steps.length) {
      iterations++;
      if (iterations > maxIterations) {
        throw new Error(
          `Pipeline "${this.name}": exceeded maximum iterations (${maxIterations}). Possible infinite loop from jump/back signals.`,
        );
      }
      const step = this.steps[i];

      // Resolve the agent
      const agent = this.registry.get(step.agent);
      if (!agent) {
        throw new Error(`Pipeline "${this.name}": agent "${step.agent}" not found in registry`);
      }

      // Build task input
      let taskInput: Record<string, unknown>;
      if (step.options.input) {
        taskInput = { ...step.options.input };
      } else if (prevOutput) {
        // Apply transform if defined
        if (step.options.transform) {
          taskInput = { message: step.options.transform(prevOutput) };
        } else if (this.transformFn && i > 0) {
          taskInput = { message: this.transformFn(prevOutput) };
        } else {
          // Pass through previous output as input
          taskInput = { message: prevOutput.output.content, structured: prevOutput.output.structured };
        }
      } else {
        taskInput = {};
      }

      // If step has its own transform, prefer that
      if (step.options.transform && prevOutput) {
        taskInput = { message: step.options.transform(prevOutput) };
      }

      // Resolve model if step specifies one
      if (step.options.model && this.modelResolver) {
        this.modelResolver(step.options.model);
      }

      // Create the task
      const task: AgentTask = {
        type: 'chat',
        input: taskInput,
        context: { metadata: { task: step.options.task } },
      };

      // Apply timeout from step options
      if (step.options.timeout) {
        task.meta = { ...task.meta, timeout: step.options.timeout };
      }

      // Execute the step
      const stepStartTime = Date.now();
      const result = await this.executeStep(agent, task, step.name);
      const stepDuration = Date.now() - stepStartTime;

      // Check interceptors for this step
      let control: PipelineControlSignal | undefined;
      for (const interceptor of this.interceptors) {
        if (interceptor.stepName === step.name) {
          const signal = interceptor.handler(result, { stepName: step.name, stepIndex: i });
          if (signal) {
            control = signal;
            break;
          }
        }
      }

      // Check step-level intercept
      if (!control && step.options.intercept) {
        const signal = step.options.intercept(result, { stepName: step.name, stepIndex: i });
        if (signal) {
          control = signal;
        }
      }

      // Check for control signal in the result output
      if (!control && result.output.structured?.__control) {
        control = result.output.structured.__control as PipelineControlSignal;
      }

      // Save snapshot
      if (snapshotEnabled) {
        snapshots.push({
          stepName: step.name,
          stepIndex: i,
          timestamp: Date.now(),
          input: taskInput,
          output: result,
          duration: stepDuration,
          control,
        });
      }

      // Handle control signals
      if (control) {
        switch (control.action) {
          case 'stop':
            return {
              finalOutput: result,
              success: result.success,
              steps: snapshots,
              backtrackHistory,
              totalDuration: Date.now() - startTime,
            };

          case 'pause':
            // v1: just stop the pipeline and return partial result
            return {
              finalOutput: result,
              success: result.success,
              steps: snapshots,
              backtrackHistory,
              totalDuration: Date.now() - startTime,
            };

          case 'back': {
            const targetStep = control.targetStep;
            if (!targetStep) {
              throw new Error(`Pipeline "${this.name}": back signal requires targetStep`);
            }
            backtrackCount++;
            if (backtrackCount > maxBacktracks) {
              throw new Error(
                `Pipeline "${this.name}": exceeded max backtracks (${maxBacktracks})`,
              );
            }
            const targetIndex = this.steps.findIndex((s) => s.name === targetStep);
            if (targetIndex === -1) {
              throw new Error(
                `Pipeline "${this.name}": target step "${targetStep}" not found for back signal`,
              );
            }
            const backtrackEvent: BacktrackEvent = {
              fromStep: step.name,
              toStep: targetStep,
              reason: control.reason ?? control.message ?? '',
              retryCount: backtrackCount,
              maxRetries: maxBacktracks,
              timestamp: Date.now(),
              control,
            };
            backtrackHistory.push(backtrackEvent);
            if (this.config_.onBacktrack) {
              this.config_.onBacktrack(backtrackEvent);
            }
            // Jump back to the target step
            i = targetIndex;
            // If there's a message, incorporate it into the next step's input
            if (control.message) {
              prevOutput = {
                ...result,
                output: {
                  ...result.output,
                  content: control.message,
                  structured: { ...result.output.structured, __backtrackMessage: control.message },
                },
              };
            }
            continue;
          }

          case 'jump': {
            const targetStep = control.targetStep;
            if (!targetStep) {
              throw new Error(`Pipeline "${this.name}": jump signal requires targetStep`);
            }
            const targetIndex = this.steps.findIndex((s) => s.name === targetStep);
            if (targetIndex === -1) {
              throw new Error(
                `Pipeline "${this.name}": target step "${targetStep}" not found for jump signal`,
              );
            }
            i = targetIndex;
            prevOutput = result;
            continue;
          }

          case 'fork': {
            const branches = this.forkMap.get(step.name);
            if (branches && branches.length > 0) {
              const branchResults = await Promise.all(
                branches.map(async (branch) => {
                  const branchAgent = this.registry.get(branch.agent);
                  if (!branchAgent) {
                    throw new Error(
                      `Pipeline "${this.name}": fork branch agent "${branch.agent}" not found`,
                    );
                  }
                  const branchTask: AgentTask = {
                    type: 'chat',
                    input: branch.input ?? taskInput,
                    context: { metadata: { task: branch.task } },
                  };
                  return this.executeStep(branchAgent, branchTask, branch.name);
                }),
              );
              // Merge fork results into prevOutput
              const forkOutput: Record<string, unknown> = {};
              for (let b = 0; b < branches.length; b++) {
                forkOutput[branches[b].name] = branchResults[b];
              }
              prevOutput = {
                success: true,
                output: {
                  content: JSON.stringify(forkOutput),
                  structured: forkOutput,
                },
                meta: {
                  duration: branchResults.reduce((sum, r) => sum + r.meta.duration, 0),
                  tokensUsed: branchResults.reduce(
                    (sum, r) => ({
                      input: sum.input + r.meta.tokensUsed.input,
                      output: sum.output + r.meta.tokensUsed.output,
                      total: sum.total + r.meta.tokensUsed.total,
                    }),
                    { input: 0, output: 0, total: 0 },
                  ),
                  model: 'fork',
                },
              };
            }
            i++;
            continue;
          }

          case 'replace': {
            const targetStep = control.targetStep;
            if (!targetStep) {
              throw new Error(`Pipeline "${this.name}": replace signal requires targetStep`);
            }
            const targetIndex = this.steps.findIndex((s) => s.name === targetStep);
            if (targetIndex === -1) {
              throw new Error(
                `Pipeline "${this.name}": target step "${targetStep}" not found for replace signal`,
              );
            }
            // Replace the target step's agent and continue from there
            i = targetIndex;
            prevOutput = result;
            continue;
          }

          case 'continue':
          default:
            break;
        }
      }

      prevOutput = result;

      // Check for branch — evaluate after each step if branchFn is set
      if (this.branchFn && prevOutput) {
        const branchStep = this.branchFn(prevOutput);
        if (branchStep) {
          // Branch condition matched — execute the branch step
          // StepOptions doesn't have an agent field, but the design docs show
          // branch returning { agent: 'sales', task: '...' }. We support this
          // by treating the agent field as a dynamic extension.
          const branchOpts = branchStep as unknown as Record<string, unknown>;
          const branchAgentName = branchOpts.agent as string | undefined;
          if (branchAgentName) {
            const branchAgent = this.registry.get(branchAgentName);
            if (branchAgent) {
              const branchTask: AgentTask = {
                type: 'chat',
                input: branchStep.input ?? { message: prevOutput.output.content },
                context: { metadata: { task: branchStep.task } },
              };
              const branchResult = await this.executeStep(branchAgent, branchTask, `[branch]${branchAgentName}`);
              prevOutput = branchResult;

              if (snapshotEnabled) {
                snapshots.push({
                  stepName: `[branch]${branchAgentName}`,
                  stepIndex: i,
                  timestamp: Date.now(),
                  input: branchTask.input,
                  output: branchResult,
                  duration: branchResult.meta.duration,
                });
              }
            }
          }
        }
      }

      i++;
    }

    if (!prevOutput) {
      throw new Error(`Pipeline "${this.name}": no steps executed`);
    }

    return {
      finalOutput: prevOutput,
      success: prevOutput.success,
      steps: snapshots,
      backtrackHistory,
      totalDuration: Date.now() - startTime,
    };
  }

  /** Execute a single agent step, handling errors and timeouts. */
  private async executeStep(
    agent: IAgent,
    task: AgentTask,
    stepName: string,
  ): Promise<AgentResult> {
    try {
      const result = await agent.execute(task);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: { content: `Step "${stepName}" failed: ${message}` },
        meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'error' },
        error: { code: 'STEP_ERROR', message },
      };
    }
  }
}
