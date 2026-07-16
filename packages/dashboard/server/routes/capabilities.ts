import { createRouter, eventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import type { AuditLog } from '@agentforge/core';
import type { Capability, DistributeCapabilityRequest } from '@agentforge/types';
import { createHttpError, readValidatedBody } from '@agentforge/http-server';
import type { CapabilityStore } from '../services/CapabilityStore.js';
import type { NodeRegistry } from '../services/NodeRegistry.js';

const jsonSchema = z.record(z.unknown());
const exampleValue = z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.unknown()),
  z.record(z.unknown()),
]);
const commonCapabilityShape = {
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: jsonSchema.optional(),
  outputSchema: jsonSchema.optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  sensitiveOperations: z.array(z.string()).optional(),
};

const capabilitySchema: z.ZodType<Capability> = z.discriminatedUnion('type', [
  z.object({
    ...commonCapabilityShape,
    type: z.literal('agent'),
  }),
  z.object({
    ...commonCapabilityShape,
    type: z.literal('remote-agent'),
    nodeId: z.string().min(1),
    endpoint: z.string().min(1).optional(),
  }),
  z.object({
    ...commonCapabilityShape,
    type: z.literal('tool'),
    endpointType: z.enum(['local-command', 'local-function', 'http', 'remote-agent']),
    endpoint: z.object({
      target: z.string().min(1),
      method: z.enum(['exec', 'call', 'post', 'get']).optional(),
    }),
    inputSchema: jsonSchema,
  }),
  z.object({
    ...commonCapabilityShape,
    type: z.literal('skill'),
    tools: z.array(z.string()),
    promptTemplate: z.string(),
    examples: z.array(z.object({ input: exampleValue, output: exampleValue })).optional(),
  }),
  z.object({
    ...commonCapabilityShape,
    type: z.literal('plugin'),
    downloadUrl: z.string().url(),
    signature: z.string().min(1),
    keyId: z.string().min(1),
    entry: z.string().min(1),
    allowedCapabilities: z.array(z.string()),
    sandbox: z.object({
      timeoutMs: z.number().int().positive(),
      maxMemoryPages: z.number().int().positive(),
    }),
  }),
]);

const distributeSchema = z.object({
  nodeIds: z.array(z.string().min(1)),
  action: z.enum(['add', 'update', 'remove']),
  targetVersion: z.string().optional(),
});

export function createCapabilitiesRoute(
  store: CapabilityStore,
  registry: NodeRegistry,
  auditLog?: AuditLog
) {
  const router = createRouter();

  router.get(
    '/',
    eventHandler(() => store.list())
  );

  router.post(
    '/',
    eventHandler(async (event) => {
      const body = await readValidatedBody(event, capabilitySchema);
      await store.create(body);
      return { success: true };
    })
  );

  router.get(
    '/:id',
    eventHandler((event) => {
      const id = getRouterParam(event, 'id')!;
      const capability = store.get(id);
      if (!capability) {
        throw createHttpError('CAPABILITY_NOT_FOUND', `Capability "${id}" not found`, 404);
      }
      return capability;
    })
  );

  router.put(
    '/:id',
    eventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!;
      const body = await readValidatedBody(event, capabilitySchema);
      await store.update(id, body);
      return { success: true };
    })
  );

  router.delete(
    '/:id',
    eventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!;
      await store.delete(id);
      return { success: true };
    })
  );

  router.get(
    '/:id/versions',
    eventHandler((event) => {
      const id = getRouterParam(event, 'id')!;
      return store.versions(id);
    })
  );

  router.post(
    '/:id/distribute',
    eventHandler(async (event) => {
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
      const result = await registry.distribute(request.nodeIds, payload);
      if (auditLog) {
        await auditLog.record({
          action: 'capability-distribute',
          resource: id,
          outcome: 'success',
          details: {
            nodeIds: request.nodeIds,
            distributeAction: request.action,
            targetVersion: request.targetVersion,
          },
        });
      }
      return result;
    })
  );

  return router;
}
