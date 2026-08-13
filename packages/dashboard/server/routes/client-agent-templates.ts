import { createRouter, eventHandler, getRouterParam } from 'h3';
import { createHttpError } from '@agentforge/http-server';
import type { ClientAgentTemplateStore } from '../services/ClientAgentTemplateStore.js';
import { requireRoles } from '../middleware/auth.js';

export function createClientAgentTemplatesRoute(store: ClientAgentTemplateStore) {
  const router = createRouter();

  router.get(
    '/',
    eventHandler(async (event) => {
      requireRoles(event, ['admin', 'readonly']);
      return store.list();
    })
  );

  router.get(
    '/:id',
    eventHandler(async (event) => {
      requireRoles(event, ['admin', 'readonly']);
      const id = getRouterParam(event, 'id')!;
      const template = await store.get(id);
      if (!template) {
        throw createHttpError('TEMPLATE_NOT_FOUND', `Template "${id}" not found`, 404);
      }
      return template;
    })
  );

  return router;
}
