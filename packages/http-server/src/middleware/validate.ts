import { readBody, getQuery, type H3Event, type EventHandlerRequest } from 'h3';
import { ZodSchema, ZodError } from 'zod';
import { createHttpError } from './error.js';

export interface ValidatedBody<T> {
  body: T;
}

export async function readValidatedBody<T>(event: H3Event, schema: ZodSchema<T>): Promise<T> {
  const raw = await readBody<EventHandlerRequest>(event);
  return validate(schema, raw ?? {});
}

export function getValidatedQuery<T>(event: H3Event, schema: ZodSchema<T>): T {
  const raw = getQuery<EventHandlerRequest>(event);
  return validate(schema, raw ?? {});
}

function validate<T>(schema: ZodSchema<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw createHttpError(
        'VALIDATION_ERROR',
        error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        400,
        error.errors
      );
    }
    throw error;
  }
}
