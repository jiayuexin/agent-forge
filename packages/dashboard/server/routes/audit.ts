import { createRouter, eventHandler, getQuery } from 'h3';
import { z } from 'zod';
import type { AuditLog } from '@agentforge/core';
import { readValidatedBody } from '@agentforge/http-server';

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

export function createAuditRoute(auditLog: AuditLog) {
  const router = createRouter();

  router.get(
    '/',
    eventHandler(async (event) => {
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
      const body = await readValidatedBody(event, recordSchema);
      await auditLog.record(body);
      return { success: true };
    })
  );

  return router;
}
