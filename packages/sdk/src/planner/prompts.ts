import type { AgentTask, Capability } from '@agentforge/types';

export function buildPlanningPrompt(task: AgentTask, capabilities: Capability[]): string {
  return [
    'You are a planning agent. Given a task and a list of available capabilities, produce an execution plan as JSON.',
    '',
    'The JSON must match this shape:',
    JSON.stringify(
      {
        goal: 'short description of the task goal',
        capabilitiesUsed: ['capability-id-1', 'capability-id-2'],
        steps: [
          {
            id: 'step-1',
            name: 'human readable name',
            capability: 'capability-id-1',
            type: 'agent',
            task: 'concise instruction for this step',
            input: {},
            dependsOn: [],
            outputAs: 'alias',
            fallback: 'fallback-capability-id',
          },
        ],
        constraints: {
          maxSteps: 10,
          requireApproval: false,
          timeout: 30000,
        },
      },
      null,
      2
    ),
    '',
    'Available capabilities:',
    capabilities
      .map((c) => `- ${c.id} (${c.type}): ${c.description}`)
      .join('\n') || 'None',
    '',
    'Task:',
    JSON.stringify(task, null, 2),
    '',
    'Return only the JSON plan, with no markdown fences.',
  ].join('\n');
}

export function buildReplanningPrompt(
  task: AgentTask,
  capabilities: Capability[],
  failedStep: { stepId: string; error?: { message?: string } },
  completedSteps: string[],
  remainingSteps: string[]
): string {
  return [
    'You are a planning agent. A previous execution plan failed at one step. Produce a revised execution plan as JSON.',
    '',
    'Task:',
    JSON.stringify(task, null, 2),
    '',
    'Available capabilities:',
    capabilities.map((c) => `- ${c.id} (${c.type}): ${c.description}`).join('\n') || 'None',
    '',
    `Failed step: ${failedStep.stepId}`,
    failedStep.error?.message ? `Error: ${failedStep.error.message}` : '',
    '',
    `Completed steps: ${completedSteps.join(', ') || 'none'}`,
    `Remaining steps before failure: ${remainingSteps.join(', ') || 'none'}`,
    '',
    'Return only the revised JSON plan, with no markdown fences.',
  ].join('\n');
}
