import { z } from 'zod';

const protocolVersion = z.literal(1).optional();

export const remoteTaskSchema = z.object({
  taskId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
  type: z.enum(['execute', 'stream', 'chat']),
  task: z.object({
    type: z.string().min(1),
    input: z.record(z.unknown()),
    context: z.record(z.unknown()).optional(),
    meta: z.record(z.unknown()).optional(),
  }),
  source: z.string().min(1),
  issuedAt: z.number(),
  timeout: z.number().optional(),
});

export const cancelTaskSchema = z.object({
  taskId: z.string().min(1),
});

export const controlMessageSchema = z.object({
  type: z.enum([
    'execute',
    'stream',
    'config-update',
    'capability-distribute',
    'cancel',
    'ping',
    'stop',
  ]),
  protocolVersion,
  messageId: z.string().min(1),
  nodeId: z.string().min(1),
  timestamp: z.number(),
  payload: z.unknown(),
});

export const agentMessageSchema = z.object({
  type: z.enum([
    'result',
    'stream-chunk',
    'status',
    'metric',
    'event',
    'capability-ack',
    'config-ack',
    'local-approval-request',
    'pong',
    'error',
  ]),
  protocolVersion,
  messageId: z.string().optional(),
  nodeId: z.string().min(1),
  timestamp: z.number(),
  payload: z.unknown().optional(),
});

export const configAckSchema = z.object({
  status: z.enum(['applied', 'rejected']),
  error: z.string().optional(),
});
