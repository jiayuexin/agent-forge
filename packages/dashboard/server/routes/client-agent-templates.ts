import { createRouter, eventHandler, getRouterParam } from 'h3';
import { createHttpError } from '@agentforge/http-server';
import type { ClientAgentTemplateStore } from '../services/ClientAgentTemplateStore.js';

export function createClientAgentTemplatesRoute(store: ClientAgentTemplateStore) {
  const router = createRouter();

  router.get('/', eventHandler(async () => store.list()));

  router.get('/:id', eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')!;
    const template = await store.get(id);
    if (!template) {
      throw createHttpError('TEMPLATE_NOT_FOUND', `Template "${id}" not found`, 404);
    }
    return template;
  }));

  return router;
}
