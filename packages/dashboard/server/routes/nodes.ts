import { createRouter, eventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import type { AgentTask, NodeConfigUpdateRequest } from '@agentforge/types';
import { createHttpError, readValidatedBody, sendAgentStream } from '@agentforge/http-server';
import type { NodeRegistry } from '../services/NodeRegistry.js';

const executeSchema = z.object({
  type: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  context: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
});

const configUpdateSchema = z.object({
  allowRemoteExecution: z.boolean().optional(),
  heartbeatInterval: z.number().optional(),
  requireLocalConfirmation: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export function createNodesRoute(registry: NodeRegistry) {
  const router = createRouter();

  router.get('/', eventHandler(() => registry.list()));

  router.get('/:id', eventHandler((event) => {
    const id = getRouterParam(event, 'id')!;
    const session = registry.get(id);
    if (!session) {
      throw createHttpError('NODE_NOT_FOUND', `Node "${id}" not found`, 404);
    }
    return session.node;
  }));

  router.post('/:id/execute', eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')!;
    const body = await readValidatedBody(event, executeSchema);
    const result = await registry.execute(id, body as AgentTask);
    return result;
  }));

  router.post('/:id/stream', eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')!;
    const body = await readValidatedBody(event, executeSchema);
    const stream = registry.stream(id, body as AgentTask);
    await sendAgentStream(event, stream);
  }));

  router.post('/:id/config', eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')!;
    const body = await readValidatedBody(event, configUpdateSchema);
    const session = registry.get(id);
    if (!session) {
      throw createHttpError('NODE_NOT_FOUND', `Node "${id}" not found`, 404);
    }
    await session.updateConfig(body as NodeConfigUpdateRequest);
    return { success: true };
  }));

  router.delete('/:id', eventHandler((event) => {
    const id = getRouterParam(event, 'id')!;
    const removed = registry.unregister(id);
    if (!removed) {
      throw createHttpError('NODE_NOT_FOUND', `Node "${id}" not found`, 404);
    }
    return { success: true };
  }));

  return router;
}
