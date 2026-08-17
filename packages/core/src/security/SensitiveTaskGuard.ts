import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { AgentTask } from '@agentforge/types';

export function isSensitiveTask(task: AgentTask, requireLocalConfirmation: string[] = []): boolean {
  if (requireLocalConfirmation.some((tag) => task.type.includes(tag))) {
    return true;
  }

  const inputText = JSON.stringify(task.input).toLowerCase();
  return requireLocalConfirmation.some((tag) => inputText.includes(tag.toLowerCase()));
}

export async function askLocalUserConfirmation(task: AgentTask, prompt?: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  const message =
    prompt ??
    `Allow sensitive task "${task.type}" with input ${JSON.stringify(task.input)}? [y/N] `;

  const answer = await rl.question(message);
  rl.close();
  return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
}
