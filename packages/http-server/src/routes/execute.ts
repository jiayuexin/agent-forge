import { eventHandler } from 'h3';
import { z } from 'zod';
import type { AgentTask, IAgent } from '@agentforge/types';
import { readValidatedBody } from '../middleware/validate.js';

const executeSchema = z.object({
  type: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  context: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
});

export function createExecuteRoute(agent: IAgent) {
  return eventHandler(async (event) => {
    const body = await readValidatedBody(event, executeSchema);
    const result = await agent.execute(body as AgentTask);
    return result;
  });
}
