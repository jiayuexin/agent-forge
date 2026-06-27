import type {
  AgentResult,
  AgentTask,
  BacktrackEvent,
  ForkBranch,
  InterceptorHandler,
  ISnapshotable,
  ModelConfig,
  ModelRef,
  ParallelStep,
  PipelineConfig,
  PipelineControlSignal,
  PipelineResult,
  StepOptions,
  StepSnapshot,
  IAgent,
} from '@agentforge/types';
import { PipelineError, SDKError } from './errors.js';

export interface PipelineRuntime {
  getAgent(name: string): IAgent;
  resolveModel(model?: string | ModelRef, defaultModel?: string): ModelConfig;
  emit(event: string, data: unknown): void;
}

type StepDescriptor =
  | { kind: 'serial'; name: string; options: StepOptions }
  | { kind: 'parallel'; steps: ParallelStep[] }
  | { kind: 'branch'; decider: (prevOutput: AgentResult) => StepOptions | ParallelStep | (StepOptions | ParallelStep)[] }
  | { kind: 'fork'; branches: ForkBranch[] }
  | { kind: 'back'; targetStep: string; message?: string };

export class Pipeline {
  private pipelineConfig: PipelineConfig = {};
  private descriptors: StepDescriptor[] = [];
  private interceptors: InterceptorHandler[] = [];
  private runtime?: PipelineRuntime;

  constructor(_name?: string, config?: PipelineConfig) {
    if (config) this.pipelineConfig = { ...this.pipelineConfig, ...config };
  }

  attachRuntime(runtime: PipelineRuntime): this {
    this.runtime = runtime;
    return this;
  }

  config(config: PipelineConfig): this {
    this.pipelineConfig = { ...this.pipelineConfig, ...config };
    return this;
  }

  add(name: string, options: StepOptions): this {
    this.descriptors.push({ kind: 'serial', name, options });
    return this;
  }

  parallel(steps: ParallelStep[]): this {
    this.descriptors.push({ kind: 'parallel', steps });
    return this;
  }

  branch(decider: (prevOutput: AgentResult) => StepOptions | ParallelStep | (StepOptions | ParallelStep)[]): this {
    this.descriptors.push({ kind: 'branch', decider });
    return this;
  }

  fork(branches: ForkBranch[]): this {
    this.descriptors.push({ kind: 'fork', branches });
    return this;
  }

  intercept(handler: InterceptorHandler): this {
    this.interceptors.push(handler);
    return this;
  }

  back(targetStep: string, message?: string): this {
    this.descriptors.push({ kind: 'back', targetStep, message });
    return this;
  }

  async run(): Promise<PipelineResult> {
    const startTime = Date.now();
    const config = this.resolveConfig();
    const steps: StepSnapshot[] = [];
    const backtrackHistory: BacktrackEvent[] = [];
    const backtrackCounts = new Map<string, number>();
    let totalBacktracks = 0;
    let prevOutput = this.emptyResult();

    const serialIndexByName = new Map<string, number>();
    for (let i = 0; i < this.descriptors.length; i++) {
      const d = this.descriptors[i];
      if (d.kind === 'serial') serialIndexByName.set(d.name, i);
    }

    for (let i = 0; i < this.descriptors.length; ) {
      const descriptor = this.descriptors[i];
      const stepStartedAt = Date.now();

      if (descriptor.kind === 'back') {
        if (prevOutput.success) {
          i++;
          continue;
        }
        const signal: PipelineControlSignal = {
          action: 'back',
          targetStep: descriptor.targetStep,
          message: descriptor.message,
        };
        const handled = this.handleControlSignal(
          signal,
          '',
          i,
          serialIndexByName,
          backtrackCounts,
          backtrackHistory,
          config,
          totalBacktracks
        );
        if (handled.stop) {
          return this.buildResult(handled.output ?? prevOutput, steps, backtrackHistory, startTime, undefined);
        }
        prevOutput = handled.output ?? prevOutput;
        i = handled.nextIndex ?? i + 1;
        totalBacktracks++;
        continue;
      }

      let output: AgentResult;
      let stepName: string;

      switch (descriptor.kind) {
        case 'serial': {
          stepName = descriptor.name;
          output = await this.runSerial(stepName, descriptor.options, prevOutput, config);
          break;
        }
        case 'parallel': {
          stepName = 'parallel';
          output = await this.runParallel(descriptor.steps, config);
          break;
        }
        case 'branch': {
          stepName = 'branch';
          output = await this.runBranch(descriptor.decider, prevOutput, config);
          break;
        }
        case 'fork': {
          stepName = 'fork';
          output = await this.runFork(descriptor.branches, config);
          break;
        }
        default: {
          // Exhaustiveness: back handled above; TS still needs a default.
          stepName = '';
          i++;
          continue;
        }
      }

      const stepIndex = i;
      const duration = Date.now() - stepStartedAt;

      const stepInterceptSignal = descriptor.kind === 'serial' ? descriptor.options.intercept?.(output, {}) : undefined;
      const interceptorSignal = this.runInterceptors(stepName, output);
      const controlSignal = stepInterceptSignal ?? interceptorSignal;

      steps.push({
        stepName,
        stepIndex,
        timestamp: stepStartedAt,
        input: this.inferInput(prevOutput, descriptor),
        output,
        duration,
        control: controlSignal,
      });

      prevOutput = output;

      if (controlSignal) {
        const handled = this.handleControlSignal(
          controlSignal,
          stepName,
          i,
          serialIndexByName,
          backtrackCounts,
          backtrackHistory,
          config,
          totalBacktracks
        );
        if (handled.stop) {
          return this.buildResult(handled.output ?? prevOutput, steps, backtrackHistory, startTime, undefined);
        }
        prevOutput = handled.output ?? prevOutput;
        i = handled.nextIndex ?? i + 1;
        if (controlSignal.action === 'back') totalBacktracks++;
        continue;
      }

      i++;
    }

    const success = prevOutput.success && totalBacktracks <= (config.maxBacktracks ?? 5);
    return this.buildResult(prevOutput, steps, backtrackHistory, startTime, success);
  }

  private resolveConfig(): Required<Pick<PipelineConfig, 'maxBacktracks' | 'defaultMaxRetry' | 'snapshotEnabled'>> &
    PipelineConfig {
    return {
      maxBacktracks: 5,
      defaultMaxRetry: 2,
      snapshotEnabled: true,
      ...this.pipelineConfig,
    };
  }

  private emptyResult(): AgentResult {
    return {
      success: true,
      output: { content: '' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'pipeline',
      },
    };
  }

  private inferInput(prevOutput: AgentResult, descriptor: StepDescriptor): unknown {
    if (descriptor.kind === 'serial') {
      if (descriptor.options.transform) return descriptor.options.transform(prevOutput);
      if (descriptor.options.input !== undefined) return descriptor.options.input;
      return prevOutput;
    }
    if (descriptor.kind === 'parallel') {
      return descriptor.steps.map((s) => s.input ?? {});
    }
    if (descriptor.kind === 'fork') {
      return descriptor.branches.map((b) => b.input ?? {});
    }
    return prevOutput;
  }

  private async runSerial(_stepName: string, options: StepOptions, prevOutput: AgentResult, config: PipelineConfig): Promise<AgentResult> {
    const agent = this.requireRuntime().getAgent(options.agent);

    if (options.model !== undefined) {
      // Validate the model reference but do not reconfigure the agent in this phase.
      this.requireRuntime().resolveModel(options.model, config.defaultModel);
    }

    let input: unknown;
    if (options.transform) input = options.transform(prevOutput);
    else if (options.input !== undefined) input = options.input;
    else input = prevOutput;

    const task: AgentTask = {
      type: 'pipeline-step',
      input: typeof input === 'object' && input !== null
        ? { task: options.task, ...(input as Record<string, unknown>) }
        : { task: options.task, value: input },
    };

    return this.executeAgent(agent, task, options.timeout);
  }

  private async runParallel(steps: ParallelStep[], config: PipelineConfig): Promise<AgentResult> {
    const startedAt = Date.now();
    const results = await Promise.all(
      steps.map((step) => {
        const agent = this.requireRuntime().getAgent(step.agent);
        if (step.model !== undefined) {
          this.requireRuntime().resolveModel(step.model, config.defaultModel);
        }
        const task: AgentTask = {
          type: 'pipeline-step',
          input: { task: step.task, ...(step.input ?? {}) },
        };
        return this.executeAgent(agent, task);
      })
    );
    return this.combineResults(results, startedAt);
  }

  private async runFork(branches: ForkBranch[], config: PipelineConfig): Promise<AgentResult> {
    return this.runParallel(
      branches.map((b) => ({ name: b.name, agent: b.agent, task: b.task, input: b.input, model: b.model })),
      config
    );
  }

  private async runBranch(
    decider: (prevOutput: AgentResult) => StepOptions | ParallelStep | (StepOptions | ParallelStep)[],
    prevOutput: AgentResult,
    config: PipelineConfig
  ): Promise<AgentResult> {
    const choice = decider(prevOutput);
    const items = Array.isArray(choice) ? choice : [choice];
    let output = prevOutput;
    for (const item of items) {
      if ('agent' in item && 'task' in item) {
        if (Array.isArray(item)) {
          // Not reachable because item is a single StepOptions | ParallelStep.
          continue;
        }
        if ('name' in item) {
          output = await this.runParallel([item as ParallelStep], config);
        } else {
          const stepOptions = item as StepOptions;
          output = await this.runSerial('branch-step', stepOptions, output, config);
        }
      }
    }
    return output;
  }

  private combineResults(results: AgentResult[], startedAt: number): AgentResult {
    const branches: Record<string, AgentResult> = {};
    let index = 0;
    for (const result of results) {
      branches[`branch-${index++}`] = result;
    }
    const duration = Date.now() - startedAt;
    const totalTokens = results.reduce(
      (acc, r) => ({
        input: acc.input + (r.meta.tokensUsed?.input ?? 0),
        output: acc.output + (r.meta.tokensUsed?.output ?? 0),
        total: acc.total + (r.meta.tokensUsed?.total ?? 0),
      }),
      { input: 0, output: 0, total: 0 }
    );
    return {
      success: results.every((r) => r.success),
      output: {
        content: '',
        structured: { branches },
      },
      meta: {
        duration,
        tokensUsed: totalTokens,
        model: 'pipeline',
      },
    };
  }

  private async executeAgent(agent: IAgent, task: AgentTask, timeout?: number): Promise<AgentResult> {
    if (timeout === undefined) {
      return agent.execute(task);
    }
    return Promise.race([
      agent.execute(task),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new SDKError('STEP_TIMEOUT', `Pipeline step timed out after ${timeout}ms`)), timeout)
      ),
    ]);
  }

  private runInterceptors(stepName: string, output: AgentResult): PipelineControlSignal | undefined {
    for (const interceptor of this.interceptors) {
      if (interceptor.stepName === stepName) {
        const signal = interceptor.handler(output, {});
        if (signal) return signal;
      }
    }
    return undefined;
  }

  private handleControlSignal(
    signal: PipelineControlSignal,
    fromStep: string,
    _currentIndex: number,
    serialIndexByName: Map<string, number>,
    backtrackCounts: Map<string, number>,
    backtrackHistory: BacktrackEvent[],
    config: ReturnType<typeof this.resolveConfig>,
    totalBacktracks: number
  ): { stop: boolean; nextIndex?: number; output?: AgentResult } {
    switch (signal.action) {
      case 'continue':
        return { stop: false };
      case 'stop':
        return { stop: true };
      case 'pause':
        throw new PipelineError('PIPELINE_PAUSED', signal.message ?? 'Pipeline was paused');
      case 'fork':
        throw new PipelineError('UNSUPPORTED_CONTROL_SIGNAL', 'Runtime fork control signal is not supported');
      case 'replace':
      case 'jump':
      case 'back': {
        const target = signal.targetStep;
        if (!target) {
          throw new PipelineError('MISSING_TARGET_STEP', `${signal.action} control signal requires targetStep`);
        }
        const targetIndex = serialIndexByName.get(target);
        if (targetIndex === undefined) {
          throw new PipelineError('TARGET_STEP_NOT_FOUND', `Target step "${target}" not found`);
        }

        if (signal.action === 'back') {
          const maxRetries = signal.maxRetries ?? config.defaultMaxRetry ?? 2;
          const count = (backtrackCounts.get(target) ?? 0) + 1;
          backtrackCounts.set(target, count);

          const backtrackEvent: BacktrackEvent = {
            fromStep,
            toStep: target,
            reason: signal.reason ?? signal.message ?? '',
            retryCount: count,
            maxRetries,
            timestamp: Date.now(),
            control: signal,
          };
          backtrackHistory.push(backtrackEvent);
          if (config.onBacktrack) config.onBacktrack(backtrackEvent);

          if (count > maxRetries || totalBacktracks + 1 > (config.maxBacktracks ?? 5)) {
            return {
              stop: true,
              output: this.errorResult(
                'MAX_BACKTRACKS_EXCEEDED',
                `Backtrack to "${target}" exceeded retry or global backtrack limit`
              ),
            };
          }

          if (config.snapshotEnabled) {
            void this.restoreAgentSnapshot(target);
          }
        }

        return { stop: false, nextIndex: targetIndex };
      }
    }
  }

  private async restoreAgentSnapshot(stepName: string): Promise<void> {
    const descriptor = this.descriptors.find((d) => d.kind === 'serial' && d.name === stepName);
    if (!descriptor || descriptor.kind !== 'serial') return;
    try {
      const agent = this.requireRuntime().getAgent(descriptor.options.agent);
      if ('snapshot' in agent && 'restore' in agent) {
        await (agent as unknown as ISnapshotable).restore(undefined);
      }
    } catch {
      // Snapshot restore is best-effort; failures do not halt the pipeline.
    }
  }

  private errorResult(code: string, message: string): AgentResult {
    return {
      success: false,
      output: { content: '' },
      meta: {
        duration: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        model: 'pipeline',
      },
      error: { code, message },
    };
  }

  private buildResult(
    finalOutput: AgentResult,
    steps: StepSnapshot[],
    backtrackHistory: BacktrackEvent[],
    startTime: number,
    success?: boolean
  ): PipelineResult {
    return {
      finalOutput,
      success: (success ?? finalOutput.success) && finalOutput.success,
      steps,
      backtrackHistory,
      totalDuration: Date.now() - startTime,
    };
  }

  private requireRuntime(): PipelineRuntime {
    if (!this.runtime) {
      throw new SDKError('PIPELINE_NOT_ATTACHED', 'Pipeline has not been attached to a runtime');
    }
    return this.runtime;
  }
}
