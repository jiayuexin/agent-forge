import { createRouter, eventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import { createHttpError, readValidatedBody } from '@agentforge/http-server';
import type { GeneratedClientAgentStore } from '../services/GeneratedClientAgentStore.js';

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(10),
  templateId: z.string().min(1),
  model: z.string().optional(),
});

export function createClientAgentsRoute(store: GeneratedClientAgentStore) {
  const router = createRouter();

  router.get('/', eventHandler(async () => store.list()));

  router.get('/:id', eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')!;
    const agent = store.get(id);
    if (!agent) {
      throw createHttpError('CLIENT_AGENT_NOT_FOUND', `ClientAgent "${id}" not found`, 404);
    }
    return agent;
  }));

  router.post('/', eventHandler(async (event) => {
    const body = await readValidatedBody(event, createSchema);
    return store.create(body);
  }));

  return router;
}
