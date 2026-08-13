import { createRouter, eventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { createHttpError, readValidatedBody } from '@agentforge/http-server';
import { actorFromAuth, getAuth, requireRoles } from '../middleware/auth.js';
import type { RepositoryAuditLog } from '../storage/RepositoryAuditLog.js';

const recordSchema = z.object({
  action: z.string().min(1),
  actor: z.string().optional(),
  resource: z.string().optional(),
  outcome: z.enum(['success', 'failure', 'denied']),
  details: z.record(z.unknown()).optional(),
  timestamp: z.number().optional(),
});

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function createAuditRoute(auditLog: RepositoryAuditLog) {
  const router = createRouter();

  router.get(
    '/',
    eventHandler(async (event) => {
      requireRoles(event, ['admin', 'readonly']);
      const query = getQuery(event);
      return auditLog.query({
        from: parseOptionalInt(query.from),
        to: parseOptionalInt(query.to),
        action:
          typeof query.action === 'string' && query.action.length > 0 ? query.action : undefined,
        limit: parseOptionalInt(query.limit),
        offset: parseOptionalInt(query.offset),
      });
    })
  );

  router.post(
    '/',
    eventHandler(async (event) => {
      const auth = getAuth(event);
      if (auth.role === 'readonly') {
        throw createHttpError('FORBIDDEN', 'Readonly tokens cannot write audit events', 403);
      }
      const body = await readValidatedBody(event, recordSchema);
      if (auth.role === 'node' && body.action !== 'local-command') {
        throw createHttpError(
          'FORBIDDEN',
          'Node tokens may only report local-command audit events',
          403
        );
      }
      await auditLog.record({
        ...body,
        actor: actorFromAuth(auth),
      });
      return { success: true };
    })
  );

  return router;
}
