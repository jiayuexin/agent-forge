import { eventHandler } from 'h3';
import { z } from 'zod';
import type { AgentTask, IAgent } from '@agentforge/types';
import { readValidatedBody } from '../middleware/validate.js';
import { sendAgentStream } from '../utils/sse.js';

const streamSchema = z.object({
  type: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  context: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
});

export function createStreamRoute(agent: IAgent) {
  return eventHandler(async (event) => {
    const body = await readValidatedBody(event, streamSchema);
    const stream = agent.stream(body as AgentTask);
    await sendAgentStream(event, stream);
  });
}
