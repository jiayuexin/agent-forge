import { createRouter, eventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import type { Capability, DistributeCapabilityRequest } from '@agentforge/types';
import { createHttpError, readValidatedBody } from '@agentforge/http-server';
import type { CapabilityStore } from '../services/CapabilityStore.js';
import type { NodeRegistry } from '../services/NodeRegistry.js';

const capabilitySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['agent', 'tool', 'skill', 'plugin', 'remote-agent']),
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  sensitiveOperations: z.array(z.string()).optional(),
});

const distributeSchema = z.object({
  nodeIds: z.array(z.string().min(1)),
  action: z.enum(['add', 'update', 'remove']),
  targetVersion: z.string().optional(),
});

export function createCapabilitiesRoute(store: CapabilityStore, registry: NodeRegistry) {
  const router = createRouter();

  router.get('/', eventHandler(() => store.list()));

  router.post('/', eventHandler(async (event) => {
    const body = await readValidatedBody(event, capabilitySchema);
    await store.create(body as Capability);
    return { success: true };
  }));

  router.get('/:id', eventHandler((event) => {
    const id = getRouterParam(event, 'id')!;
    const capability = store.get(id);
    if (!capability) {
      throw createHttpError('CAPABILITY_NOT_FOUND', `Capability "${id}" not found`, 404);
    }
    return capability;
  }));

  router.put('/:id', eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')!;
    const body = await readValidatedBody(event, capabilitySchema);
    await store.update(id, body as Capability);
    return { success: true };
  }));

  router.delete('/:id', eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')!;
    await store.delete(id);
    return { success: true };
  }));

  router.get('/:id/versions', eventHandler((event) => {
    const id = getRouterParam(event, 'id')!;
    return store.versions(id);
  }));

  router.post('/:id/distribute', eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')!;
    const body = await readValidatedBody(event, distributeSchema);
    const capability = store.get(id);
    if (!capability) {
      throw createHttpError('CAPABILITY_NOT_FOUND', `Capability "${id}" not found`, 404);
    }
    const request = body as DistributeCapabilityRequest;
    const payload = {
      action: request.action,
      capability,
      targetVersion: request.targetVersion,
    };
    return registry.distribute(request.nodeIds, payload);
  }));

  return router;
}
