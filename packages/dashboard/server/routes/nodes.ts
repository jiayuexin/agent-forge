import { createRouter, eventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import type { AgentTask, NodeConfigUpdateRequest } from '@agentforge/types';
import { createHttpError, readValidatedBody, sendAgentStream } from '@agentforge/http-server';
import type { NodeRegistry } from '../services/NodeRegistry.js';
import {
  actorFromAuth,
  filterNodesForAuth,
  requireAdmin,
  requireNodeScope,
  requireRoles,
} from '../middleware/auth.js';
import type { RepositoryAuditLog } from '../storage/RepositoryAuditLog.js';

const executeSchema = z.object({
  type: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  context: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
});

const configUpdateSchema = z.object({
  heartbeatInterval: z.number().optional(),
  tags: z.array(z.string()).optional(),
  nodeName: z.string().optional(),
});

export function createNodesRoute(registry: NodeRegistry, auditLog?: RepositoryAuditLog) {
  const router = createRouter();

  router.get(
    '/',
    eventHandler((event) => {
      const auth = requireRoles(event, ['admin', 'readonly', 'node']);
      return filterNodesForAuth(auth, registry.list());
    })
  );

  router.get(
    '/:id',
    eventHandler((event) => {
      const id = getRouterParam(event, 'id')!;
      requireNodeScope(event, id, 'read');
      const session = registry.get(id);
      if (!session) {
        throw createHttpError('NODE_NOT_FOUND', `Node "${id}" not found`, 404);
      }
      return session.node;
    })
  );

  const cancelSchema = z.object({
    taskId: z.string().min(1),
  });

  router.post(
    '/:id/cancel',
    eventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!;
      const auth = requireAdmin(event);
      const body = await readValidatedBody(event, cancelSchema);
      await registry.cancel(id, body.taskId);
      if (auditLog) {
        await auditLog.record({
          action: 'node-cancel',
          actor: actorFromAuth(auth),
          resource: id,
          outcome: 'success',
          details: { taskId: body.taskId },
        });
      }
      return { success: true };
    })
  );

  router.post(
    '/:id/execute',
    eventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!;
      const auth = requireAdmin(event);
      const body = await readValidatedBody(event, executeSchema);
      try {
        const result = await registry.execute(id, body as AgentTask);
        if (auditLog) {
          await auditLog.record({
            action: 'node-execute',
            actor: actorFromAuth(auth),
            resource: id,
            outcome: 'success',
          });
        }
        return result;
      } catch (error) {
        if (auditLog) {
          await auditLog.record({
            action: 'node-execute',
            actor: actorFromAuth(auth),
            resource: id,
            outcome: 'failure',
            details: { error: error instanceof Error ? error.message : String(error) },
          });
        }
        throw error;
      }
    })
  );

  router.post(
    '/:id/stream',
    eventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!;
      const auth = requireAdmin(event);
      const body = await readValidatedBody(event, executeSchema);
      if (auditLog) {
        await auditLog.record({
          action: 'node-stream',
          actor: actorFromAuth(auth),
          resource: id,
          outcome: 'success',
        });
      }
      const stream = registry.stream(id, body as AgentTask);
      await sendAgentStream(event, stream);
    })
  );

  router.post(
    '/:id/config',
    eventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!;
      const auth = requireAdmin(event);
      const body = await readValidatedBody(event, configUpdateSchema);
      const session = registry.get(id);
      if (!session) {
        throw createHttpError('NODE_NOT_FOUND', `Node "${id}" not found`, 404);
      }
      await session.updateConfig(body as NodeConfigUpdateRequest);
      if (auditLog) {
        await auditLog.record({
          action: 'config-change',
          actor: actorFromAuth(auth),
          resource: id,
          outcome: 'success',
          details: body as Record<string, unknown>,
        });
      }
      return { success: true };
    })
  );

  router.delete(
    '/:id',
    eventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!;
      const auth = requireAdmin(event);
      const removed = registry.unregister(id);
      if (!removed) {
        throw createHttpError('NODE_NOT_FOUND', `Node "${id}" not found`, 404);
      }
      if (auditLog) {
        await auditLog.record({
          action: 'node-unregister',
          actor: actorFromAuth(auth),
          resource: id,
          outcome: 'success',
        });
      }
      return { success: true };
    })
  );

  return router;
}
