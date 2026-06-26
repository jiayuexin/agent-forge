import type {
  AgentResult,
  AgentTask,
  IProvider,
  Message,
  ToolDefinition,
} from '@agentforge/types';

export class AgentExecutor {
  constructor(
    private provider: IProvider,
    private tools: ToolDefinition[],
    private systemPrompt: string
  ) {}

  async execute(task: AgentTask): Promise<AgentResult> {
    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      ...(task.context?.history ?? []),
      { role: 'user', content: this.taskToString(task) },
    ];

    const startedAt = Date.now();
    const response = await this.provider.chat({
      messages,
      tools: this.tools,
      temperature: task.meta?.priority ? 0.5 : undefined,
      traceId: task.meta?.traceId,
    });
    const duration = Date.now() - startedAt;

    return {
      success: true,
      output: {
        content: response.content,
        structured: response.structured,
      },
      meta: {
        duration,
        tokensUsed: response.usage,
        model: response.model,
        toolsCalled: response.toolCalls?.map((tc) => ({
          name: tc.name,
          args: tc.args,
          result: null,
          duration: 0,
          status: 'success' as const,
        })),
      },
    };
  }

  private taskToString(task: AgentTask): string {
    if (typeof task.input === 'string') return task.input;
    return JSON.stringify(task.input);
  }
}
